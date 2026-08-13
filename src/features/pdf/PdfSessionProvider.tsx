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
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from './pdfjs'
import { loadPdfSession, savePdfSession } from './pdf-session-store'
import type { PdfSessionSnapshot } from './pdf-session-store'
import { useSettings } from '@/features/settings/SettingsProvider'

export type PdfViewMode = 'continuous' | 'single'
export type PdfFitMode = 'width' | 'page' | 'manual'
export type PdfSessionStatus = 'idle' | 'loading' | 'ready' | 'error'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
const ROTATIONS = [0, 90, 180, 270]

function nextRotation(current: number, step: number): number {
  const index = ROTATIONS.indexOf(current)
  return ROTATIONS[(index + step + ROTATIONS.length) % ROTATIONS.length]
}

export interface PdfDocumentInfo {
  title: string | null
  author: string | null
  creator: string | null
  producer: string | null
  creationDate: string | null
  modificationDate: string | null
}

export interface PdfScrollTarget {
  page: number
  nonce: number
}

interface PdfSessionValue {
  status: PdfSessionStatus
  error: string | null
  document: PDFDocumentProxy | null
  numPages: number
  currentPage: number
  scrollTarget: PdfScrollTarget | null
  info: PdfDocumentInfo | null
  mode: PdfViewMode
  fitMode: PdfFitMode
  zoom: number
  rotation: number
  setMode: (mode: PdfViewMode) => void
  setFitMode: (fitMode: PdfFitMode) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  rotateClockwise: () => void
  rotateCounterClockwise: () => void
  resetRotation: () => void
  goToPage: (page: number) => void
  nextPage: () => void
  previousPage: () => void
  reportVisiblePage: (page: number) => void
}

const PdfSessionContext = createContext<PdfSessionValue | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function describePdfError(error: unknown): string {
  if (error instanceof pdfjs.PasswordException) {
    return 'This PDF is password-protected and cannot be opened.'
  }
  if (error instanceof pdfjs.InvalidPDFException) {
    return 'This file is not a valid PDF or is corrupted.'
  }
  if (error instanceof Error) {
    return `This PDF could not be opened: ${error.message}`
  }
  return 'This PDF could not be opened.'
}

function extractInfo(
  metadata: { info?: Record<string, unknown> } | null,
): PdfDocumentInfo {
  const info = metadata?.info ?? ({} as Record<string, unknown>)
  const value = (key: string): string | null => {
    const raw = info[key]
    return typeof raw === 'string' && raw.length > 0 ? raw : null
  }
  return {
    title: value('Title'),
    author: value('Author'),
    creator: value('Creator'),
    producer: value('Producer'),
    creationDate: value('CreationDate'),
    modificationDate: value('ModDate'),
  }
}

interface PdfSessionProviderProps {
  blob: Blob | null
  /** Local document id used to persist and restore the view session. */
  documentId?: string
  children: ReactNode
}

/**
 * PdfSessionProvider loads a PDF blob into a pdf.js document once and
 * shares the session — page count, current page, zoom and fit mode —
 * between the main viewer and the thumbnail panel. The document is
 * destroyed when the provider unmounts or the blob changes.
 */
export function PdfSessionProvider({
  blob,
  documentId,
  children,
}: PdfSessionProviderProps) {
  const [status, setStatus] = useState<PdfSessionStatus>(
    blob ? 'loading' : 'idle',
  )
  const [error, setError] = useState<string | null>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [info, setInfo] = useState<PdfDocumentInfo | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [scrollTarget, setScrollTarget] = useState<PdfScrollTarget | null>(null)
  const { settings } = useSettings()
  const [mode, setModeState] = useState<PdfViewMode>(settings.viewer.mode)
  const [fitMode, setFitModeState] = useState<PdfFitMode>(settings.viewer.fitMode)
  const [zoom, setZoomState] = useState(settings.viewer.zoom)
  const [rotation, setRotationState] = useState(0)

  const numPagesRef = useRef(0)
  const currentPageRef = useRef(1)
  const documentIdRef = useRef(documentId)
  const persistSnapshotRef = useRef<PdfSessionSnapshot | null>(null)
  const lastDocKeyRef = useRef<{ id: string | null; seen: boolean }>({
    id: null,
    seen: false,
  })

  /* Adjust session state during render when the blob/document changes so the
   * reset happens synchronously instead of inside the load effect. A fresh
   * blob for the *same* document keeps the view state; a *different* document
   * (or none) resets it. */
  const [lastDocKey, setLastDocKey] = useState<{
    id: string | null
    seen: boolean
  }>({ id: null, seen: false })
  if (blob) {
    const key = documentId ?? null
    if (!lastDocKey.seen || lastDocKey.id !== key) {
      setLastDocKey({ id: key, seen: true })
      setError(null)
      setCurrentPage(1)
      setRotationState(0)
      setZoomState(settings.viewer.zoom)
      setFitModeState(settings.viewer.fitMode)
      setModeState(settings.viewer.mode)
      setScrollTarget(null)
      setStatus('loading')
    }
  } else if (lastDocKey.seen || lastDocKey.id !== null) {
    setLastDocKey({ id: null, seen: false })
    setDocument(null)
    setNumPages(0)
    setInfo(null)
    setError(null)
    setStatus('idle')
  }

  useEffect(() => {
    numPagesRef.current = numPages
  }, [numPages])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    documentIdRef.current = documentId
  }, [documentId])

  /**
   * Loads the current blob into a pdf.js document.
   *
   * A fresh blob for the *same* document — for example the bytes written by
   * an editor save — refreshes the document data in place and keeps the view
   * state (current page, zoom, rotation, fit mode). Without that, every edit
   * bounces the user back to page 1 at default zoom and flashes the loading
   * screen. Opening a *different* document resets the view state and restores
   * the persisted session snapshot for that document.
   */
  /* Owns the live document so a blob swap never destroys the document the
   * viewer is still rendering: the new document is loaded and published
   * first, then the previous one is released. Destroying the old document
   * during a reload makes pdf.js page lookups (`document.getPage`) throw on
   * the torn-down worker and crash the viewer. */
  const documentRef = useRef<{
    doc: PDFDocumentProxy
    task: PDFDocumentLoadingTask
  } | null>(null)

  useEffect(() => {
    return () => {
      const current = documentRef.current
      documentRef.current = null
      if (current) {
        void current.task.destroy().catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (!blob) {
      lastDocKeyRef.current = { id: null, seen: false }
      const current = documentRef.current
      documentRef.current = null
      if (current) {
        void current.task.destroy().catch(() => undefined)
      }
      return
    }

    const documentIdKey = documentId ?? null
    const isNewDocument =
      !lastDocKeyRef.current.seen || lastDocKeyRef.current.id !== documentIdKey
    lastDocKeyRef.current = { id: documentIdKey, seen: true }

    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    let resolved = false

    blob
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) return null
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buffer),
          // Text editing needs the compiled embedded font bytes after PDF.js
          // has bound the font face so replacements can reuse the typeface.
          fontExtraProperties: true,
        })
        return loadingTask.promise
      })
      .then(async (loaded) => {
        if (cancelled || !loaded || !loadingTask) return null
        resolved = true
        const previous = documentRef.current
        documentRef.current = { doc: loaded, task: loadingTask }
        setDocument(loaded)
        setNumPages(loaded.numPages)
        setCurrentPage((current) => clamp(current, 1, loaded.numPages))
        if (isNewDocument && documentId) {
          const snapshot = await loadPdfSession(documentId).catch(() => null)
          if (cancelled) return null
          if (snapshot) {
            setCurrentPage(clamp(Math.round(snapshot.page), 1, loaded.numPages))
            setScrollTarget(null)
            setZoomState(clamp(snapshot.zoom, MIN_ZOOM, MAX_ZOOM))
            setFitModeState(snapshot.fitMode)
            setModeState(snapshot.mode)
            setRotationState(snapshot.rotation ?? 0)
          }
        }
        /* The viewer now holds the new document; the old one can be released
         * without racing the renderers that still referenced it. */
        if (previous) {
          void previous.task.destroy().catch(() => undefined)
        }
        return loaded.getMetadata()
      })
      .then((metadata) => {
        if (cancelled) return
        setError(null)
        setInfo(
          extractInfo(metadata as { info?: Record<string, unknown> } | null),
        )
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(describePdfError(reason))
        setStatus('error')
      })

    return () => {
      cancelled = true
      /* Only an in-flight load is aborted here. A resolved task owns the
       * published document (tracked in documentRef), which is released when
       * the next document is published or the provider unmounts. */
      if (loadingTask && !resolved) {
        void loadingTask.destroy().catch(() => undefined)
      }
    }
  }, [blob, documentId])

  /* Persist the view session (page, zoom, fit modes) for this document. */
  useEffect(() => {
    if (status !== 'ready' || !documentId) return
    const snapshot: PdfSessionSnapshot = {
      page: currentPage,
      zoom,
      fitMode,
      mode,
      rotation,
    }
    persistSnapshotRef.current = snapshot
    const handle = window.setTimeout(() => {
      void savePdfSession(documentId, snapshot)
    }, 300)
    return () => {
      window.clearTimeout(handle)
    }
  }, [status, documentId, currentPage, zoom, fitMode, mode, rotation])

  /* Flush the pending session when the provider unmounts. */
  useEffect(() => {
    return () => {
      const snapshot = persistSnapshotRef.current
      const id = documentIdRef.current
      if (snapshot && id) {
        void savePdfSession(id, snapshot)
      }
    }
  }, [])

  const goToPage = useCallback((page: number) => {
    const target = clamp(Math.round(page), 1, numPagesRef.current || 1)
    setCurrentPage(target)
    setScrollTarget({ page: target, nonce: Date.now() })
  }, [])

  const nextPage = useCallback(() => {
    const target = clamp(
      currentPageRef.current + 1,
      1,
      numPagesRef.current || 1,
    )
    setCurrentPage(target)
    setScrollTarget({ page: target, nonce: Date.now() })
  }, [])

  const previousPage = useCallback(() => {
    const target = clamp(
      currentPageRef.current - 1,
      1,
      numPagesRef.current || 1,
    )
    setCurrentPage(target)
    setScrollTarget({ page: target, nonce: Date.now() })
  }, [])

  const reportVisiblePage = useCallback((page: number) => {
    setCurrentPage(clamp(page, 1, numPagesRef.current || 1))
  }, [])

  const setMode = useCallback((next: PdfViewMode) => {
    setModeState(next)
  }, [])

  const setFitMode = useCallback((next: PdfFitMode) => {
    setFitModeState(next)
  }, [])

  const setZoom = useCallback((next: number) => {
    setZoomState(clamp(next, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const zoomIn = useCallback(() => {
    setFitModeState('manual')
    setZoomState((current) => clamp(current * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const zoomOut = useCallback(() => {
    setFitModeState('manual')
    setZoomState((current) => clamp(current / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const resetZoom = useCallback(() => {
    setZoomState(1)
    setFitModeState('width')
  }, [])

  const rotateClockwise = useCallback(() => {
    setRotationState((current) => nextRotation(current, 1))
  }, [])

  const rotateCounterClockwise = useCallback(() => {
    setRotationState((current) => nextRotation(current, -1))
  }, [])

  const resetRotation = useCallback(() => {
    setRotationState(0)
  }, [])

  const value = useMemo<PdfSessionValue>(
    () => ({
      status,
      error,
      document,
      numPages,
      currentPage,
      scrollTarget,
      info,
      mode,
      fitMode,
      zoom,
      rotation,
      setMode,
      setFitMode,
      setZoom,
      zoomIn,
      zoomOut,
      resetZoom,
      rotateClockwise,
      rotateCounterClockwise,
      resetRotation,
      goToPage,
      nextPage,
      previousPage,
      reportVisiblePage,
    }),
    [
      status,
      error,
      document,
      numPages,
      currentPage,
      scrollTarget,
      info,
      mode,
      fitMode,
      zoom,
      rotation,
      setMode,
      setFitMode,
      setZoom,
      zoomIn,
      zoomOut,
      resetZoom,
      rotateClockwise,
      rotateCounterClockwise,
      resetRotation,
      goToPage,
      nextPage,
      previousPage,
      reportVisiblePage,
    ],
  )

  return (
    <PdfSessionContext.Provider value={value}>
      {children}
    </PdfSessionContext.Provider>
  )
}

export function usePdfSession(): PdfSessionValue {
  const context = useContext(PdfSessionContext)
  if (!context) {
    throw new Error('usePdfSession must be used within a PdfSessionProvider')
  }
  return context
}
