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
import { useSettings } from '@/features/settings/SettingsProvider'
import * as engine from './engine'
import { ByteHistory } from './history'
import {
  readElementsFromDoc,
  stripElementStreams,
  writeElementsToDoc,
  drawElements,
} from './element-pdf'
import {
  createElementId,
  duplicateElementsForPages,
  remapElementsAfterDelete,
  remapElementsAfterInsert,
  remapElementsAfterPageRotate,
  remapElementsAfterReorder,
  remapElementsAfterReplace,
} from './elements'
import type { EditorTool, PdfElement } from './elements'
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
  /** Bumps on structural changes only (page ops, undo/redo) — not element edits. */
  structuralVersion: number
  numPages: number
  pages: EditorPage[]
  selectedPageIds: string[]
  canUndo: boolean
  canRedo: boolean
  saveState: EditorSaveState
  busy: boolean
  /** Editable elements (text, image, shape) across all pages. */
  elements: PdfElement[]
  editMode: boolean
  tool: EditorTool
  selectedElementIds: string[]
  setEditMode: (enabled: boolean) => void
  setTool: (tool: EditorTool) => void
  selectElement: (id: string) => void
  toggleElement: (id: string) => void
  clearElementSelection: () => void
  addElement: (element: PdfElement, coalesce?: boolean) => Promise<void>
  updateElement: (
    id: string,
    patch: Partial<PdfElement>,
    coalesce?: boolean,
  ) => Promise<void>
  deleteElements: (ids: string[]) => Promise<void>
  duplicateElements: (ids: string[]) => Promise<void>
  commitElements: (
    update: (elements: PdfElement[]) => PdfElement[],
    coalesce?: boolean,
  ) => Promise<void>
  moveElementToLayer: (
    id: string,
    direction: 'forward' | 'backward' | 'front' | 'back',
  ) => Promise<void>
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
  resizePage: (id: string, width: number, height: number) => Promise<void>
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
  /**
   * Resyncs the live pdf.js viewer (and thumbnails) with the true current
   * bytes. Content-only edits (text replacements) intentionally never do
   * this in real time — see `applyContentOnlyMutation` below — so this is
   * called at natural checkpoints instead: a successful save, or turning
   * text-edit mode off.
   */
  syncViewer: () => void
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
  const { settings } = useSettings()
  const autoSaveEnabled = settings.general.autoSave
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
  const [elements, setElements] = useState<PdfElement[]>([])
  const [editMode, setEditModeState] = useState(false)
  const [tool, setToolState] = useState<EditorTool>('select')
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
  /**
   * Increments only on structural changes (page insert/delete/reorder/
   * rotate, undo/redo) — never on element edits. The viewer uses it to
   * avoid reloading the pdf.js document for pure element gestures.
   */
  const [structuralVersion, setStructuralVersion] = useState(0)

  const docRef = useRef<PDFDocument | null>(null)
  const bytesRef = useRef<Uint8Array | null>(null)
  const pagesRef = useRef<EditorPage[]>([])
  const elementsRef = useRef<PdfElement[]>([])
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
    setElements([])
    setSelectedElementIds([])
    setEditModeState(false)
    setToolState('select')
    setSaveState('saved')
    setBusy(false)
    setError(null)
    setHistoryState({ canUndo: false, canRedo: false })
    setStructuralVersion(0)
    setStatus(documentId !== null && blob !== null ? 'loading' : 'idle')
  }

  useEffect(() => {
    elementsRef.current = []
  }, [sessionKey])

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
      elementsRef.current = []
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
        const loadedElements = readElementsFromDoc(loaded)
        docRef.current = loaded
        bytesRef.current = loadedBytes
        pagesRef.current = engine.describePages(loaded)
        elementsRef.current = loadedElements
        historyRef.current.clear()
        anchorIdRef.current = null
        sessionRef.current = { id, bytes: loadedBytes, dirty: false }
        setHistoryState({ canUndo: false, canRedo: false })
        setElements(loadedElements)
        setBytes(loadedBytes)
        setPages(pagesRef.current)
        setSelectedPageIds([])
        setSelectedElementIds([])
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

  /**
   * Resyncs the live pdf.js viewer (and thumbnails) with the true current
   * bytes. Content-only edits (text replacements) intentionally never do
   * this in real time — see `applyContentOnlyMutation` below — so this is
   * called at natural checkpoints instead: a successful save, or turning
   * text-edit mode off. No-op via reference equality if nothing was
   * actually deferred (bytesRef and bytes state already match). Defined
   * before `save` since `save` depends on it.
   */
  const syncViewer = useCallback(() => {
    const current = bytesRef.current
    if (!current) return
    setBytes((previous) => (previous === current ? previous : current))
  }, [])

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
      syncViewer()
      return { error: null }
    } catch {
      setSaveState('save-failed')
      return { error: 'The changes could not be saved to this device.' }
    }
  }, [document, syncViewer])

  useEffect(() => {
    if (!autoSaveEnabled) return
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
  }, [status, saveState, bytes, save, autoSaveEnabled])

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

  /* ------------------------------------------------------------------ *
   * Element editing
   * ------------------------------------------------------------------ */

  const setEditMode = useCallback((enabled: boolean) => {
    setEditModeState(enabled)
    if (!enabled) {
      setSelectedElementIds([])
      setToolState('select')
    }
  }, [])

  const selectElement = useCallback((id: string) => {
    setSelectedElementIds([id])
  }, [])

  const toggleElement = useCallback((id: string) => {
    setSelectedElementIds((previous) =>
      previous.includes(id)
        ? previous.filter((entry) => entry !== id)
        : [...previous, id],
    )
  }, [])

  const clearElementSelection = useCallback(() => {
    setSelectedElementIds([])
  }, [])

  const commitElements = useCallback(
    async (
      update: (elements: PdfElement[]) => PdfElement[],
      coalesce = false,
    ): Promise<void> => {
      const previousBytes = bytesRef.current
      if (!previousBytes || status !== 'ready') return
      const prevElements = elementsRef.current
      const nextElements = update(prevElements)
      if (nextElements === prevElements) return
      /* A mapped array where every element is unchanged (e.g. a selection
         click that produced a zero-distance move) must not pollute the
         undo history or trigger a document rewrite. */
      if (
        nextElements.length === prevElements.length &&
        nextElements.every((element, index) => element === prevElements[index])
      ) {
        return
      }
      /* Publish the new element list optimistically BEFORE the async PDF
         regeneration. Without this the overlay's synchronous draft commit
         (pointerup -> setDraft(null)) re-renders against the old element
         list, so the element snaps back to its previous position for a
         frame until the regenerated bytes arrive. */
      elementsRef.current = nextElements
      setElements(nextElements)
      setSelectedElementIds((previous) =>
        previous.filter((id) =>
          nextElements.some((element) => element.id === id),
        ),
      )
      setBusy(true)
      try {
        const nextDoc = await engine.loadPdf(previousBytes)
        stripElementStreams(nextDoc)
        writeElementsToDoc(nextDoc, nextElements)
        if (nextElements.length > 0) {
          await drawElements(nextDoc, nextElements)
        }
        const nextBytes = await engine.serializePdf(nextDoc)
        historyRef.current.commit(previousBytes, coalesce)
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
      } catch (error) {
        elementsRef.current = prevElements
        setElements(prevElements)
        throw error
      } finally {
        setBusy(false)
      }
    },
    [document, status],
  )

  const addElement = useCallback(
    (element: PdfElement, coalesce = false) =>
      commitElements((elements) => [...elements, element], coalesce),
    [commitElements],
  )

  const updateElement = useCallback(
    (id: string, patch: Partial<PdfElement>, coalesce = false) =>
      commitElements(
        (elements) =>
          elements.map((element) =>
            element.id === id
              ? ({ ...element, ...patch } as PdfElement)
              : element,
          ),
        coalesce,
      ),
    [commitElements],
  )

  const deleteElements = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      return commitElements((elements) =>
        elements.filter((element) => !idSet.has(element.id)),
      )
    },
    [commitElements],
  )

  const duplicateElements = useCallback(
    async (ids: string[]) => {
      let createdIds: string[] = []
      await commitElements((elements) => {
        const idSet = new Set(ids)
        const maxZ = elements.reduce(
          (max, element) => Math.max(max, element.zIndex),
          0,
        )
        const copies: PdfElement[] = []
        let offset = 1
        for (const element of elements) {
          if (!idSet.has(element.id)) continue
          copies.push({
            ...element,
            id: createElementId(),
            x: element.x + 24,
            y: element.y + 24,
            zIndex: maxZ + offset,
          })
          offset += 1
        }
        createdIds = copies.map((copy) => copy.id)
        return copies.length > 0 ? [...elements, ...copies] : elements
      })
      if (createdIds.length > 0) {
        setSelectedElementIds(createdIds)
      }
    },
    [commitElements],
  )

  const moveElementToLayer = useCallback(
    (id: string, direction: 'forward' | 'backward' | 'front' | 'back') =>
      commitElements((elements) => {
        const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)
        const index = sorted.findIndex((element) => element.id === id)
        if (index === -1) return elements
        const target =
          direction === 'front'
            ? sorted.length - 1
            : direction === 'back'
              ? 0
              : direction === 'forward'
                ? index + 1
                : index - 1
        if (target < 0 || target >= sorted.length || target === index)
          return elements
        const [moved] = sorted.splice(index, 1)
        sorted.splice(target, 0, moved)
        return sorted.map((element, position) =>
          element.zIndex === position + 1
            ? element
            : { ...element, zIndex: position + 1 },
        )
      }),
    [commitElements],
  )

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
      reconcile?: (elements: readonly PdfElement[]) => PdfElement[],
    ): Promise<void> => {
      const previousBytes = bytesRef.current
      if (!previousBytes || status !== 'ready') return
      setBusy(true)
      try {
        const nextDoc = await engine.loadPdf(previousBytes)
        await mutate(nextDoc)
        const nextElements = reconcile
          ? reconcile(elementsRef.current)
          : elementsRef.current
        stripElementStreams(nextDoc)
        writeElementsToDoc(nextDoc, nextElements)
        if (nextElements.length > 0) {
          await drawElements(nextDoc, nextElements)
        }
        const nextBytes = await engine.serializePdf(nextDoc)
        historyRef.current.commit(previousBytes)
        docRef.current = nextDoc
        bytesRef.current = nextBytes
        elementsRef.current = nextElements
        pagesRef.current = engine.describePages(nextDoc)
        sessionRef.current = {
          id: document?.id ?? null,
          bytes: nextBytes,
          dirty: true,
        }
        setElements(nextElements)
        setSelectedElementIds((previous) =>
          previous.filter((id) =>
            nextElements.some((element) => element.id === id),
          ),
        )
        setBytes(nextBytes)
        setPages(pagesRef.current)
        setSaveState('unsaved')
        setHistoryState({ canUndo: true, canRedo: false })
        setStructuralVersion((version) => version + 1)
      } finally {
        setBusy(false)
      }
    },
    [document, status],
  )

  /**
   * Applies a mutation that only changes page CONTENT (drawn text or
   * graphics) — never page structure (count/order/size). Used only by
   * `replaceText`. Unlike `applyMutation`, this deliberately does NOT
   * call `setBytes` or bump `structuralVersion`. Those two are what
   * publish a new blob down into PdfSessionProvider, which reloads the
   * ENTIRE pdf.js document on every call — a full page-proxy refetch and
   * canvas re-render for every visible page, not just the edited one.
   * `bytesRef`/save state ARE still updated normally, so the edit is
   * fully included the next time the document is saved, undone, or
   * genuinely reloaded.
   */
  const applyContentOnlyMutation = useCallback(
    async (mutate: (doc: PDFDocument) => void | Promise<void>): Promise<void> => {
      const previousBytes = bytesRef.current
      if (!previousBytes || status !== 'ready') return
      setBusy(true)
      try {
        const nextDoc = await engine.loadPdf(previousBytes)
        await mutate(nextDoc)
        const nextElements = elementsRef.current
        stripElementStreams(nextDoc)
        writeElementsToDoc(nextDoc, nextElements)
        if (nextElements.length > 0) {
          await drawElements(nextDoc, nextElements)
        }
        const nextBytes = await engine.serializePdf(nextDoc)
        historyRef.current.commit(previousBytes)
        docRef.current = nextDoc
        bytesRef.current = nextBytes
        sessionRef.current = {
          id: document?.id ?? null,
          bytes: nextBytes,
          dirty: true,
        }
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
        const loadedElements = readElementsFromDoc(loaded)
        docRef.current = loaded
        bytesRef.current = nextBytes
        pagesRef.current = engine.describePages(loaded)
        elementsRef.current = loadedElements
        sessionRef.current = {
          id: document?.id ?? null,
          bytes: nextBytes,
          dirty: true,
        }
        setElements(loadedElements)
        setSelectedElementIds((previous) =>
          previous.filter((id) =>
            loadedElements.some((element) => element.id === id),
          ),
        )
        setBytes(nextBytes)
        setPages(pagesRef.current)
        setSaveState('unsaved')
        trimSelection()
        setStructuralVersion((version) => version + 1)
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
      const rotationByIndex = new Map(
        pagesRef.current.map((page) => [page.index, page.rotation]),
      )
      await applyMutation(
        (doc) => engine.rotatePages(doc, indices, direction),
        (elements) => {
          let next = [...elements]
          for (const index of indices) {
            const page = pagesRef.current[index]
            if (!page) continue
            next = remapElementsAfterPageRotate(
              next,
              index,
              direction,
              page.width,
              page.height,
              rotationByIndex.get(index) ?? 0,
            )
          }
          return next
        },
      )
    },
    [applyMutation, selectedIndices],
  )

  const replaceText = useCallback(
    async (edit: PdfTextEdit) => {
      await applyContentOnlyMutation((doc) => engine.replaceTextRun(doc, edit))
    },
    [applyContentOnlyMutation],
  )

  const deleteSelected = useCallback(async () => {
    const indices = selectedIndices()
    if (indices.length === 0) return
    await applyMutation(
      (doc) => engine.deletePages(doc, indices),
      (elements) => remapElementsAfterDelete(elements, indices),
    )
    trimSelection()
  }, [applyMutation, selectedIndices])

  const duplicateSelected = useCallback(async () => {
    const indices = selectedIndices()
    if (indices.length === 0) return
    const copies = indices.map((originalIndex, offset) => ({
      from: originalIndex,
      to: originalIndex + offset + 1,
    }))
    await applyMutation(
      (doc) => engine.duplicatePages(doc, indices),
      (elements) => duplicateElementsForPages(elements, copies),
    )
    const selected: string[] = []
    let offset = 0
    indices.forEach((originalIndex) => {
      selected.push(`page-${originalIndex + offset + 1}`)
      offset += 1
    })
    setSelectedPageIds(selected)
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
      await applyMutation(
        (doc) => engine.reorderPages(doc, order),
        (elements) => remapElementsAfterReorder(elements, order, pageCount),
      )
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

  const resizePage = useCallback(
    async (id: string, width: number, height: number) => {
      const pageIndex = pagesRef.current.findIndex((page) => page.id === id)
      if (pageIndex === -1) return
      const previous = pagesRef.current[pageIndex]
      if (
        width <= 0 ||
        height <= 0 ||
        (previous.width === width && previous.height === height)
      ) {
        return
      }
      await applyMutation(
        (doc) => engine.resizePage(doc, pageIndex, width, height),
        (elements) =>
          elements.map((element) => {
            if (element.page !== pageIndex) return element
            const maxX = Math.max(0, width - element.width)
            const maxY = Math.max(0, height - element.height)
            return {
              ...element,
              x: Math.min(element.x, maxX),
              y: Math.min(element.y, maxY),
            }
          }),
      )
    },
    [applyMutation],
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
        await applyMutation(
          (doc) =>
            engine.insertPdfPages(
              doc,
              bytes,
              sourceCount.indices,
              targetIndex + offset,
            ),
          (elements) =>
            remapElementsAfterInsert(
              elements,
              targetIndex + offset,
              sourceCount.count,
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
      await applyMutation(
        (doc) => engine.insertImagePages(doc, imageFiles, targetIndex),
        (elements) =>
          remapElementsAfterInsert(elements, targetIndex, imageFiles.length),
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
      await applyMutation(
        (doc) =>
          engine.insertBlankPage(doc, targetIndex, reference ?? undefined),
        (elements) => remapElementsAfterInsert(elements, targetIndex, 1),
      )
      setSelectedPageIds([`page-${targetIndex}`])
    },
    [applyMutation],
  )

  const replacePageWithFile = useCallback(
    async (index: number, file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await applyMutation(
        (doc) =>
          engine.isImageFile(file)
            ? engine.replacePageWithImage(doc, index, file)
            : engine.replacePage(doc, index, bytes),
        (elements) => remapElementsAfterReplace(elements, index),
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
      structuralVersion,
      numPages: pages.length,
      pages,
      selectedPageIds,
      canUndo: historyState.canUndo,
      canRedo: historyState.canRedo,
      saveState,
      busy,
      elements,
      editMode,
      tool,
      selectedElementIds,
      setEditMode,
      setTool: setToolState,
      selectElement,
      toggleElement,
      clearElementSelection,
      addElement,
      updateElement,
      deleteElements,
      duplicateElements,
      commitElements,
      moveElementToLayer,
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
      resizePage,
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
      syncViewer,
    }),
    [
      status,
      error,
      documentId,
      viewBlob,
      structuralVersion,
      historyState,
      pages,
      selectedPageIds,
      saveState,
      busy,
      elements,
      editMode,
      tool,
      selectedElementIds,
      setEditMode,
      setToolState,
      selectElement,
      toggleElement,
      clearElementSelection,
      addElement,
      updateElement,
      deleteElements,
      duplicateElements,
      commitElements,
      moveElementToLayer,
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
      resizePage,
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
      syncViewer,
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