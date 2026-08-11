import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { PDFDocument } from 'pdf-lib'
import type { LocalDocument } from '@/features/documents'
import { downloadBlob, saveDocumentFile } from '@/features/documents'
import * as engine from './engine'
import { ByteHistory } from './history'
import type {
  EditorPage,
  EditorSaveState,
  EditorStatus,
  PageRange,
  PdfOutput,
  RotationDirection,
  SplitMode,
  PdfTextEdit,
} from './model'

const AUTOSAVE_DELAY = 700
const HISTORY_CAPACITY = 20

interface EditorSession {
  id: string | null
  bytes: Uint8Array | null
  dirty: boolean
}

interface PdfEditorContextValue {
  status: EditorStatus
  error: string | null
  documentId: string | null
  /** The current editable PDF blob — regenerated after every edit. */
  blob: Blob | null
  numPages: number
  pages: EditorPage[]
  selectedPageIds: string[]
  canUndo: boolean
  canRedo: boolean
  saveState: EditorSaveState
  busy: boolean
  selectPage: (id: string) => void
  togglePage: (id: string) => void
  selectRange: (id: string) => void
  selectAllPages: () => void
  clearSelection: () => void
  rotateSelected: (direction: RotationDirection) => Promise<void>
  replaceText: (edit: PdfTextEdit) => Promise<void>
  deleteSelected: () => Promise<void>
  duplicateSelected: () => Promise<void>
  moveSelected: (toIndex: number) => Promise<void>
  moveSelectedBy: (delta: number) => Promise<void>
  insertPdfFiles: (files: File[], atIndex?: number) => Promise<void>
  insertImageFiles: (files: File[], atIndex?: number) => Promise<void>
  insertBlankPage: (atIndex?: number) => Promise<void>
  replacePageWithFile: (index: number, file: File) => Promise<void>
  extractSelected: () => Promise<PdfOutput | null>
  splitDocument: (mode: SplitMode, ranges?: PageRange[]) => Promise<PdfOutput[]>
  mergeDocuments: (files: File[]) => Promise<PdfOutput | null>
  undo: () => Promise<void>
  redo: () => Promise<void>
  save: () => Promise<{ error: string | null }>
  download: () => Promise<string | null>
}

const PdfEditorContext = createContext<PdfEditorContextValue | null>(null)

interface PdfEditorProviderProps {
  document: LocalDocument | null
  /** The stored file blob for `document`. */
  blob: Blob | null
  children: ReactNode
}

function describeEditorError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : 'This PDF could not be opened for editing.'
}

export function PdfEditorProvider({
  document,
  blob,
  children,
}: PdfEditorProviderProps) {
  const documentId = document?.id ?? null
  const [status, setStatus] = useState<EditorStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pages, setPages] = useState<EditorPage[]>([])
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([])
  const [saveState, setSaveState] = useState<EditorSaveState>('saved')
  const [busy, setBusy] = useState(false)
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  })

  const docRef = useRef<PDFDocument | null>(null)
  const bytesRef = useRef<Uint8Array | null>(null)
  const pagesRef = useRef<EditorPage[]>([])
  const historyRef = useRef(new ByteHistory(HISTORY_CAPACITY))
  const anchorIdRef = useRef<string | null>(null)
  const saveStateRef = useRef<EditorSaveState>('saved')
  const sessionRef = useRef<EditorSession>({
    id: null,
    bytes: null,
    dirty: false,
  })
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

  /* Reset the editor state whenever the target document or its stored
   * blob changes so stale pages never linger across sessions. */
  const [sessionKey, setSessionKey] = useState<{
    id: string | null
    hasBlob: boolean
  }>({ id: documentId, hasBlob: blob !== null })
  if (sessionKey.id !== documentId || sessionKey.hasBlob !== (blob !== null)) {
    setSessionKey({ id: documentId, hasBlob: blob !== null })
    setBytes(null)
    setPages([])
    setSelectedPageIds([])
    setSaveState('saved')
    setBusy(false)
    setError(null)
    setHistoryState({ canUndo: false, canRedo: false })
    setStatus(documentId !== null && blob !== null ? 'loading' : 'idle')
  }

  const viewBlob = useMemo(
    () =>
      bytes ? new Blob([bytes as BlobPart], { type: 'application/pdf' }) : null,
    [bytes],
  )

  /* ------------------------------------------------------------------ *
   * Loading
   * ------------------------------------------------------------------ */

  useEffect(() => {
    const id = document?.id ?? null
    if (!id || !blob) {
      docRef.current = null
      bytesRef.current = null
      pagesRef.current = []
      historyRef.current.clear()
      anchorIdRef.current = null
      sessionRef.current = { id: null, bytes: null, dirty: false }
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const loadedBytes = new Uint8Array(await blob.arrayBuffer())
        const loaded = await engine.loadPdf(loadedBytes)
        if (cancelled) return
        docRef.current = loaded
        bytesRef.current = loadedBytes
        pagesRef.current = engine.describePages(loaded)
        historyRef.current.clear()
        anchorIdRef.current = null
        sessionRef.current = { id, bytes: loadedBytes, dirty: false }
        setHistoryState({ canUndo: false, canRedo: false })
        setBytes(loadedBytes)
        setPages(pagesRef.current)
        setSelectedPageIds([])
        setSaveState('saved')
        setStatus('ready')
      } catch (reason) {
        if (cancelled) return
        setError(describeEditorError(reason))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      const session = sessionRef.current
      if (session.dirty && session.bytes && session.id) {
        void saveDocumentFile(
          session.id,
          new Blob([session.bytes as BlobPart], { type: 'application/pdf' }),
        )
      }
    }
  }, [document?.id, blob])

  /* ------------------------------------------------------------------ *
   * Autosave — debounced persistence after each edit, flushed on close
   * ------------------------------------------------------------------ */

  const save = useCallback(async (): Promise<{ error: string | null }> => {
    const id = document?.id ?? null
    const current = bytesRef.current
    if (!id || !current) return { error: 'No document is open for editing.' }
    if (saveStateRef.current === 'saving') return { error: null }
    setSaveState('saving')
    try {
      const result = await saveDocumentFile(
        id,
        new Blob([current as BlobPart], { type: 'application/pdf' }),
      )
      if (result.error) {
        setSaveState('save-failed')
        return result
      }
      sessionRef.current = { id, bytes: current, dirty: false }
      setSaveState('saved')
      return { error: null }
    } catch {
      setSaveState('save-failed')
      return { error: 'The changes could not be saved to this device.' }
    }
  }, [document])

  useEffect(() => {
    if (status !== 'ready' || saveState !== 'unsaved') return
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void save()
    }, AUTOSAVE_DELAY)
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [status, saveState, bytes, save])

  /* ------------------------------------------------------------------ *
   * Selection
   * ------------------------------------------------------------------ */

  const selectPage = useCallback((id: string) => {
    anchorIdRef.current = id
    setSelectedPageIds([id])
  }, [])

  const togglePage = useCallback((id: string) => {
    anchorIdRef.current = id
    setSelectedPageIds((previous) =>
      previous.includes(id)
        ? previous.filter((entry) => entry !== id)
        : [...previous, id],
    )
  }, [])

  const selectRange = useCallback((id: string) => {
    const ids = pagesRef.current.map((page) => page.id)
    const anchorIndex = anchorIdRef.current
      ? ids.indexOf(anchorIdRef.current)
      : 0
    const targetIndex = ids.indexOf(id)
    if (targetIndex === -1) return
    if (anchorIndex === -1) {
      anchorIdRef.current = id
      setSelectedPageIds([id])
      return
    }
    const from = Math.min(anchorIndex, targetIndex)
    const to = Math.max(anchorIndex, targetIndex)
    setSelectedPageIds(ids.slice(from, to + 1))
  }, [])

  const selectAllPages = useCallback(() => {
    setSelectedPageIds(pagesRef.current.map((page) => page.id))
  }, [])

  const clearSelection = useCallback(() => {
    anchorIdRef.current = null
    setSelectedPageIds([])
  }, [])

  const selectedIndices = useCallback((): number[] => {
    const positions = new Map(
      pagesRef.current.map((page) => [page.id, page.index]),
    )
    return selectedPageIds
      .map((id) => positions.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b)
  }, [selectedPageIds])

  function trimSelection() {
    const count = pagesRef.current.length
    setSelectedPageIds((previous) =>
      previous
        .map((id) => {
          const match = /^page-(\d+)$/.exec(id)
          const index = match ? Number(match[1]) : -1
          return index >= 0 && index < count ? id : null
        })
        .filter((id): id is string => id !== null),
    )
  }

  /* ------------------------------------------------------------------ *
   * Mutation core
   * ------------------------------------------------------------------ */

  const applyMutation = useCallback(
    async (
      mutate: (doc: PDFDocument) => void | Promise<void>,
    ): Promise<void> => {
      const previousBytes = bytesRef.current
      if (!previousBytes || status !== 'ready') return
      setBusy(true)
      try {
        const nextDoc = await engine.loadPdf(previousBytes)
        await mutate(nextDoc)
        const nextBytes = await engine.serializePdf(nextDoc)
        historyRef.current.commit(previousBytes)
        docRef.current = nextDoc
        bytesRef.current = nextBytes
        pagesRef.current = engine.describePages(nextDoc)
        sessionRef.current = {
          id: document?.id ?? null,
          bytes: nextBytes,
          dirty: true,
        }
        setBytes(nextBytes)
        setPages(pagesRef.current)
        setSaveState('unsaved')
        setHistoryState({ canUndo: true, canRedo: false })
      } finally {
        setBusy(false)
      }
    },
    [document, status],
  )

  const swapBytes = useCallback(
    async (nextBytes: Uint8Array): Promise<void> => {
      setBusy(true)
      try {
        const loaded = await engine.loadPdf(nextBytes)
        docRef.current = loaded
        bytesRef.current = nextBytes
        pagesRef.current = engine.describePages(loaded)
        sessionRef.current = {
          id: document?.id ?? null,
          bytes: nextBytes,
          dirty: true,
        }
        setBytes(nextBytes)
        setPages(pagesRef.current)
        setSaveState('unsaved')
        trimSelection()
      } finally {
        setBusy(false)
      }
    },
    [document],
  )

  const undo = useCallback(async () => {
    const current = bytesRef.current
    if (!current) return
    const previous = historyRef.current.undo(current)
    if (!previous) return
    await swapBytes(previous)
    setHistoryState({
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
    })
  }, [swapBytes])

  const redo = useCallback(async () => {
    const current = bytesRef.current
    if (!current) return
    const next = historyRef.current.redo(current)
    if (!next) return
    await swapBytes(next)
    setHistoryState({
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
    })
  }, [swapBytes])

  /* ------------------------------------------------------------------ *
   * Page operations
   * ------------------------------------------------------------------ */

  const rotateSelected = useCallback(
    async (direction: RotationDirection) => {
      const indices = selectedIndices()
      if (indices.length === 0) return
      await applyMutation((doc) => engine.rotatePages(doc, indices, direction))
    },
    [applyMutation, selectedIndices],
  )

  const replaceText = useCallback(
    async (edit: PdfTextEdit) => {
      await applyMutation((doc) => engine.replaceTextRun(doc, edit))
    },
    [applyMutation],
  )

  const deleteSelected = useCallback(async () => {
    const indices = selectedIndices()
    if (indices.length === 0) return
    await applyMutation((doc) => engine.deletePages(doc, indices))
    trimSelection()
  }, [applyMutation, selectedIndices])

  const duplicateSelected = useCallback(async () => {
    const indices = selectedIndices()
    if (indices.length === 0) return
    await applyMutation((doc) => engine.duplicatePages(doc, indices))
    const copies: string[] = []
    let offset = 0
    indices.forEach((originalIndex) => {
      copies.push(`page-${originalIndex + offset + 1}`)
      offset += 1
    })
    setSelectedPageIds(copies)
  }, [applyMutation, selectedIndices])

  const moveSelected = useCallback(
    async (toIndex: number) => {
      const indices = selectedIndices()
      if (indices.length === 0) return
      const pageCount = pagesRef.current.length
      const { order, blockStart } = engine.computeReorder(
        indices,
        toIndex,
        pageCount,
      )
      await applyMutation((doc) => engine.reorderPages(doc, order))
      setSelectedPageIds(
        Array.from(
          { length: indices.length },
          (_, offset) => `page-${blockStart + offset}`,
        ),
      )
    },
    [applyMutation, selectedIndices],
  )

  const moveSelectedBy = useCallback(
    async (delta: number) => {
      const indices = selectedIndices()
      if (indices.length === 0) return
      const pageCount = pagesRef.current.length
      const toIndex = engine.computeMoveToIndex(indices, delta, pageCount)
      await moveSelected(toIndex)
    },
    [moveSelected, selectedIndices],
  )

  const insertPdfFiles = useCallback(
    async (files: File[], atIndex?: number) => {
      const pdfFiles = files.filter((file) => !engine.isImageFile(file))
      if (pdfFiles.length === 0) return
      const pageCount = pagesRef.current.length
      const targetIndex = Math.max(0, Math.min(atIndex ?? pageCount, pageCount))
      const inserted: string[] = []
      let offset = 0
      for (const file of pdfFiles) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const sourceCount = await engine.countPdfPages(bytes)
        await applyMutation((doc) =>
          engine.insertPdfPages(
            doc,
            bytes,
            sourceCount.indices,
            targetIndex + offset,
          ),
        )
        for (let page = 0; page < sourceCount.count; page += 1) {
          inserted.push(`page-${targetIndex + offset + page}`)
        }
        offset += sourceCount.count
      }
      setSelectedPageIds(inserted)
    },
    [applyMutation],
  )

  const insertImageFiles = useCallback(
    async (files: File[], atIndex?: number) => {
      const imageFiles = files.filter((file) => engine.isImageFile(file))
      if (imageFiles.length === 0) return
      const pageCount = pagesRef.current.length
      const targetIndex = Math.max(0, Math.min(atIndex ?? pageCount, pageCount))
      await applyMutation((doc) =>
        engine.insertImagePages(doc, imageFiles, targetIndex),
      )
      setSelectedPageIds(
        Array.from(
          { length: imageFiles.length },
          (_, offset) => `page-${targetIndex + offset}`,
        ),
      )
    },
    [applyMutation],
  )

  const insertBlankPage = useCallback(
    async (atIndex?: number) => {
      const pageCount = pagesRef.current.length
      const targetIndex = Math.max(0, Math.min(atIndex ?? pageCount, pageCount))
      const reference = pagesRef.current[targetIndex - 1] ?? pagesRef.current[0]
      await applyMutation((doc) =>
        engine.insertBlankPage(doc, targetIndex, reference ?? undefined),
      )
      setSelectedPageIds([`page-${targetIndex}`])
    },
    [applyMutation],
  )

  const replacePageWithFile = useCallback(
    async (index: number, file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await applyMutation((doc) =>
        engine.isImageFile(file)
          ? engine.replacePageWithImage(doc, index, file)
          : engine.replacePage(doc, index, bytes),
      )
      setSelectedPageIds([`page-${index}`])
    },
    [applyMutation],
  )

  const extractSelected = useCallback(async (): Promise<PdfOutput | null> => {
    const current = bytesRef.current
    const indices = selectedIndices()
    if (!current || indices.length === 0) return null
    setBusy(true)
    try {
      const outBytes = await engine.extractPdf(current, indices)
      const out = await engine.loadPdf(outBytes)
      const baseName = document
        ? document.name.replace(/\.pdf$/i, '')
        : 'document'
      return {
        name: `${baseName} — extracted pages.pdf`,
        bytes: outBytes,
        pageCount: out.getPageCount(),
      }
    } finally {
      setBusy(false)
    }
  }, [document, selectedIndices])

  const splitDocument = useCallback(
    async (mode: SplitMode, ranges?: PageRange[]): Promise<PdfOutput[]> => {
      const current = bytesRef.current
      if (!current) return []
      setBusy(true)
      try {
        const total = pagesRef.current.length
        const normalizedRanges = engine.normalizeSplitRanges(
          mode,
          ranges,
          total,
        )
        if (normalizedRanges.length === 0) return []
        const parts = await engine.splitPdf(current, normalizedRanges)
        const baseName = document
          ? document.name.replace(/\.pdf$/i, '')
          : 'document'
        const outputs: PdfOutput[] = []
        for (const [index, partBytes] of parts.entries()) {
          const part = await engine.loadPdf(partBytes)
          outputs.push({
            name: `${baseName} — part ${index + 1}.pdf`,
            bytes: partBytes,
            pageCount: part.getPageCount(),
          })
        }
        return outputs
      } finally {
        setBusy(false)
      }
    },
    [document],
  )

  const mergeDocuments = useCallback(
    async (files: File[]): Promise<PdfOutput | null> => {
      if (files.length < 2) return null
      setBusy(true)
      try {
        const sources: Uint8Array[] = []
        for (const file of files) {
          sources.push(new Uint8Array(await file.arrayBuffer()))
        }
        const mergedBytes = await engine.mergePdfs(sources)
        const merged = await engine.loadPdf(mergedBytes)
        return {
          name: 'merged-document.pdf',
          bytes: mergedBytes,
          pageCount: merged.getPageCount(),
        }
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const download = useCallback(async (): Promise<string | null> => {
    const current = bytesRef.current
    if (!current || !document) return 'No document is open for editing.'
    downloadBlob(
      new Blob([current as BlobPart], { type: 'application/pdf' }),
      document.name,
    )
    return null
  }, [document])

  const value = useMemo<PdfEditorContextValue>(
    () => ({
      status,
      error,
      documentId,
      blob: viewBlob,
      numPages: pages.length,
      pages,
      selectedPageIds,
      canUndo: historyState.canUndo,
      canRedo: historyState.canRedo,
      saveState,
      busy,
      selectPage,
      togglePage,
      selectRange,
      selectAllPages,
      clearSelection,
      rotateSelected,
      replaceText,
      deleteSelected,
      duplicateSelected,
      moveSelected,
      moveSelectedBy,
      insertPdfFiles,
      insertImageFiles,
      insertBlankPage,
      replacePageWithFile,
      extractSelected,
      splitDocument,
      mergeDocuments,
      undo,
      redo,
      save,
      download,
    }),
    [
      status,
      error,
      documentId,
      viewBlob,
      pages,
      selectedPageIds,
      saveState,
      busy,
      historyState,
      selectPage,
      togglePage,
      selectRange,
      selectAllPages,
      clearSelection,
      rotateSelected,
      replaceText,
      deleteSelected,
      duplicateSelected,
      moveSelected,
      moveSelectedBy,
      insertPdfFiles,
      insertImageFiles,
      insertBlankPage,
      replacePageWithFile,
      extractSelected,
      splitDocument,
      mergeDocuments,
      undo,
      redo,
      save,
      download,
    ],
  )

  return (
    <PdfEditorContext.Provider value={value}>
      {children}
    </PdfEditorContext.Provider>
  )
}

export function usePdfEditor(): PdfEditorContextValue {
  const context = useContext(PdfEditorContext)
  if (!context) {
    throw new Error('usePdfEditor must be used within a PdfEditorProvider')
  }
  return context
}
