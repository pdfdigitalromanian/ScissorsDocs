import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from './pdfjs'
import { loadPdfSession, savePdfSession } from './pdf-session-store'
import type { PdfSessionSnapshot } from './pdf-session-store'

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
  const info = metadata?.info ?? {} as Record<string, unknown>
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
export function PdfSessionProvider({ blob, documentId, children }: PdfSessionProviderProps) {
  const [status, setStatus] = useState<PdfSessionStatus>(blob ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [info, setInfo] = useState<PdfDocumentInfo | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [scrollTarget, setScrollTarget] = useState<PdfScrollTarget | null>(null)
  const [mode, setModeState] = useState<PdfViewMode>('continuous')
  const [fitMode, setFitModeState] = useState<PdfFitMode>('width')
  const [zoom, setZoomState] = useState(1)
  const [rotation, setRotationState] = useState(0)
  const [resolvedBlob, setResolvedBlob] = useState<Blob | null>(blob)

  const numPagesRef = useRef(0)
  const currentPageRef = useRef(1)
  const documentIdRef = useRef(documentId)
  const persistSnapshotRef = useRef<PdfSessionSnapshot | null>(null)

  useEffect(() => {
    numPagesRef.current = numPages
  }, [numPages])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    documentIdRef.current = documentId
  }, [documentId])

  if (resolvedBlob !== blob) {
    setResolvedBlob(blob)
    setStatus(blob ? 'loading' : 'idle')
    setError(null)
    setDocument(null)
    setNumPages(0)
    setInfo(null)
    setCurrentPage(1)
    setRotationState(0)
  }

  useEffect(() => {
    if (!blob) return

    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null

    blob
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) return null
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
        return loadingTask.promise
      })
      .then(async (loaded) => {
        if (cancelled || !loaded) return null
        setDocument(loaded)
        setNumPages(loaded.numPages)
        if (documentId) {
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
        return loaded.getMetadata()
      })
      .then((metadata) => {
        if (cancelled) return
        setInfo(extractInfo(metadata as { info?: Record<string, unknown> } | null))
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(describePdfError(reason))
        setStatus('error')
      })

    return () => {
      cancelled = true
      if (loadingTask) {
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
    const target = clamp(currentPageRef.current + 1, 1, numPagesRef.current || 1)
    setCurrentPage(target)
    setScrollTarget({ page: target, nonce: Date.now() })
  }, [])

  const previousPage = useCallback(() => {
    const target = clamp(currentPageRef.current - 1, 1, numPagesRef.current || 1)
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

  return <PdfSessionContext.Provider value={value}>{children}</PdfSessionContext.Provider>
}

export function usePdfSession(): PdfSessionValue {
  const context = useContext(PdfSessionContext)
  if (!context) {
    throw new Error('usePdfSession must be used within a PdfSessionProvider')
  }
  return context
}
