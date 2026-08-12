import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfTextEdit } from '@/features/editor/model'
import { usePdfEditor } from '@/features/editor/PdfEditorProvider'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import { ScrollArea } from '@/components/layout'
import type { LocalDocument } from '@/features/documents'
import { downloadDocument } from '@/features/documents'
import { PdfPageView } from './PdfPageView'
import { PdfTextFormattingToolbar } from './PdfTextFormattingToolbar'
import { PdfInfoModal } from './PdfInfoModal'
import { registerBundledEditorFontFaces } from './text-format'
import type { PdfTextFormat, PdfTextSelectionController } from './text-format'
import { MAX_ZOOM, MIN_ZOOM, usePdfSession } from './PdfSessionProvider'
import './pdf.css'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface ContainerSize {
  width: number
  height: number
}

interface PdfPageSlotProps {
  pageNumber: number
  scaleFor: (page: PDFPageProxy) => number
  root: Element | null
  onVisible?: (pageNumber: number) => void
  registerPage: (element: HTMLElement) => void
  unregisterPage: () => void
  textEditing: boolean
  onTextEdit: (edit: PdfTextEdit) => void
  onTextSelectionChange: (selection: PdfTextSelectionController | null) => void
}

function PdfPageSlot({
  pageNumber,
  scaleFor,
  root,
  onVisible,
  registerPage,
  unregisterPage,
  textEditing,
  onTextEdit,
  onTextSelectionChange,
}: PdfPageSlotProps) {
  const session = usePdfSession()
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let cancelled = false
    const document = session.document
    if (!document) return
    document
      .getPage(pageNumber)
      .then((loaded) => {
        if (!cancelled) setPage(loaded)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pageNumber, session.document])

  return (
    <div
      ref={(element) => {
        if (element) registerPage(element)
        else unregisterPage()
      }}
      className="pdf-page-slot"
    >
      {page ? (
        <PdfPageView
          page={page}
          scale={scaleFor(page)}
          root={root}
          onVisible={onVisible}
          clearWhenHidden={session.numPages > 15}
          textEditing={textEditing}
          onTextEdit={onTextEdit}
          onTextSelectionChange={onTextSelectionChange}
        />
      ) : (
        <div className="pdf-page-slot__placeholder" />
      )}
    </div>
  )
}

function PdfToolbar({
  document,
  containerSize,
  onOpenInfo,
  textEditing,
  canEditText,
  onToggleTextEditing,
}: {
  document: LocalDocument
  containerSize: ContainerSize
  onOpenInfo: () => void
  textEditing: boolean
  canEditText: boolean
  onToggleTextEditing: () => void
}) {
  const session = usePdfSession()
  const { toast } = useToast()
  const [pageInput, setPageInput] = useState(String(session.currentPage))
  const [syncedPage, setSyncedPage] = useState(session.currentPage)
  const [displayScale, setDisplayScale] = useState(session.zoom)

  if (syncedPage !== session.currentPage) {
    setSyncedPage(session.currentPage)
    setPageInput(String(session.currentPage))
  }

  useEffect(() => {
    let cancelled = false
    if (session.status !== 'ready' || !session.document) return
    session.document
      .getPage(session.currentPage)
      .then((page) => {
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        if (session.fitMode === 'manual') {
          setDisplayScale(session.zoom)
          return
        }
        if (containerSize.width <= 0) return
        const widthScale = containerSize.width / base.width
        if (session.fitMode === 'width') {
          setDisplayScale(widthScale)
          return
        }
        const heightScale =
          containerSize.height > 0
            ? containerSize.height / base.height
            : widthScale
        setDisplayScale(Math.min(widthScale, heightScale))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [
    session.status,
    session.document,
    session.currentPage,
    session.fitMode,
    session.zoom,
    containerSize,
  ])

  function commitPageInput() {
    const value = Number.parseInt(pageInput, 10)
    if (Number.isFinite(value)) session.goToPage(value)
    else setPageInput(String(session.currentPage))
  }

  async function handleDownload() {
    const error = await downloadDocument(document.id)
    if (error) {
      toast({ title: 'Download failed', description: error, variant: 'error' })
    }
  }

  return (
    <div className="pdf-toolbar" role="toolbar" aria-label="PDF controls">
      <div className="pdf-toolbar__group">
        <IconButton
          icon="chevron-up"
          label="Previous page"
          iconSize="sm"
          disabled={session.currentPage <= 1}
          onClick={session.previousPage}
        />
        <span className="pdf-toolbar__pages">
          <input
            type="text"
            inputMode="numeric"
            className="pdf-toolbar__page-input"
            aria-label="Current page"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitPageInput()
            }}
            onBlur={commitPageInput}
          />
          <span aria-hidden="true">/</span>
          <span className="pdf-toolbar__page-count">{session.numPages}</span>
        </span>
        <IconButton
          icon="chevron-down"
          label="Next page"
          iconSize="sm"
          disabled={session.currentPage >= session.numPages}
          onClick={session.nextPage}
        />
      </div>

      <div className="pdf-toolbar__group">
        <IconButton
          icon="edit"
          label={textEditing ? 'Stop editing text' : 'Edit text'}
          iconSize="sm"
          aria-pressed={textEditing}
          disabled={!canEditText}
          onClick={onToggleTextEditing}
        />
        {textEditing ? (
          <span className="pdf-toolbar__edit-status" aria-live="polite">
            Click text to edit
          </span>
        ) : null}
      </div>

      <div className="pdf-toolbar__group">
        <IconButton
          icon="zoom-out"
          label="Zoom out"
          iconSize="sm"
          onClick={session.zoomOut}
        />
        <span className="pdf-toolbar__zoom" aria-live="polite">
          {Math.round(displayScale * 100)}%
        </span>
        <IconButton
          icon="zoom-in"
          label="Zoom in"
          iconSize="sm"
          onClick={session.zoomIn}
        />
      </div>

      <div className="pdf-toolbar__group">
        <IconButton
          icon="fit-width"
          label="Fit to width"
          iconSize="sm"
          aria-pressed={session.fitMode === 'width'}
          onClick={() => session.setFitMode('width')}
        />
        <IconButton
          icon="fit-page"
          label="Fit to page"
          iconSize="sm"
          aria-pressed={session.fitMode === 'page'}
          onClick={() => session.setFitMode('page')}
        />
      </div>

      <div className="pdf-toolbar__group">
        <IconButton
          icon="rows"
          label="Continuous scroll"
          iconSize="sm"
          aria-pressed={session.mode === 'continuous'}
          onClick={() => session.setMode('continuous')}
        />
        <IconButton
          icon="page"
          label="Single page"
          iconSize="sm"
          aria-pressed={session.mode === 'single'}
          onClick={() => session.setMode('single')}
        />
      </div>

      <div className="pdf-toolbar__group pdf-toolbar__group--end">
        <IconButton
          icon="info"
          label="Document information"
          iconSize="sm"
          onClick={onOpenInfo}
        />
        <IconButton
          icon="download"
          label="Download this file"
          iconSize="sm"
          onClick={() => void handleDownload()}
        />
      </div>
    </div>
  )
}

interface PdfViewerProps {
  document: LocalDocument
}

/**
 * PdfViewer is the real local PDF engine surface: an accessible toolbar
 * (page navigation, zoom, fit modes, view mode), a lazy page scroller and
 * document information. It consumes the shared PDF session so the
 * thumbnail panel stays in sync.
 */
export function PdfViewer({ document }: PdfViewerProps) {
  const [searchParams] = useSearchParams()
  const session = usePdfSession()
  const editor = usePdfEditor()
  const { toast } = useToast()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollerElement, setScrollerElement] = useState<HTMLDivElement | null>(
    null,
  )
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map())
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
  })
  const [infoOpen, setInfoOpen] = useState(false)
  const requestedTextEditing = searchParams.get('tool') === 'edit-text'
  const [textEditingState, setTextEditingState] = useState(() => ({
    requested: requestedTextEditing,
    active: requestedTextEditing,
  }))
  const [textSelection, setTextSelection] =
    useState<PdfTextSelectionController | null>(null)
  const textSelectionRef = useRef<PdfTextSelectionController | null>(null)

  if (textEditingState.requested !== requestedTextEditing) {
    setTextEditingState({
      requested: requestedTextEditing,
      active: requestedTextEditing,
    })
  }
  const textEditing = textEditingState.active

  useEffect(() => {
    registerBundledEditorFontFaces()
  }, [])

  const handleTextSelectionChange = useCallback(
    (selection: PdfTextSelectionController | null) => {
      textSelectionRef.current = selection
      setTextSelection(selection ? { ...selection } : null)
    },
    [],
  )

  const handleTextFormatChange = useCallback(
    (changes: Partial<PdfTextFormat>) => {
      const selection = textSelectionRef.current
      if (!selection) return
      selection.applyFormat(changes)
    },
    [],
  )

  const commitTextSelection = useCallback(() => {
    textSelectionRef.current?.commit()
  }, [])

  const resetTextFormat = useCallback(() => {
    textSelectionRef.current?.resetFormat()
  }, [])

  const handleTextEdit = useCallback(
    (edit: PdfTextEdit) => {
      void editor.replaceText(edit).catch((reason: unknown) => {
        toast({
          title: 'Text edit could not be saved',
          description:
            reason instanceof Error
              ? reason.message
              : 'This text run could not be written into the PDF.',
          variant: 'error',
        })
      })
    },
    [editor, toast],
  )

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const measure = () => {
      setContainerSize({
        width: scroller.clientWidth,
        height: scroller.clientHeight,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!session.scrollTarget || session.mode !== 'continuous') return
    const target = pageElementsRef.current.get(session.scrollTarget.page)
    if (target) target.scrollIntoView({ block: 'start' })
  }, [session.scrollTarget, session.mode])

  const scaleFor = useCallback(
    (page: PDFPageProxy): number => {
      const base = page.getViewport({ scale: 1 })
      if (session.fitMode === 'manual') {
        return clamp(session.zoom, MIN_ZOOM, MAX_ZOOM)
      }
      if (containerSize.width <= 0) return 1
      const widthScale = containerSize.width / base.width
      if (session.fitMode === 'width') {
        return clamp(widthScale, MIN_ZOOM, MAX_ZOOM)
      }
      const heightScale =
        containerSize.height > 0
          ? containerSize.height / base.height
          : widthScale
      return clamp(Math.min(widthScale, heightScale), MIN_ZOOM, MAX_ZOOM)
    },
    [session.fitMode, session.zoom, containerSize],
  )

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const single = session.mode === 'single'
    switch (event.key) {
      case 'PageDown':
        event.preventDefault()
        session.nextPage()
        break
      case 'PageUp':
        event.preventDefault()
        session.previousPage()
        break
      case 'Home':
        event.preventDefault()
        session.goToPage(1)
        break
      case 'End':
        event.preventDefault()
        session.goToPage(session.numPages)
        break
      case 'ArrowDown':
        if (single) {
          event.preventDefault()
          session.nextPage()
        }
        break
      case 'ArrowUp':
        if (single) {
          event.preventDefault()
          session.previousPage()
        }
        break
      case '+':
      case '=':
        event.preventDefault()
        session.zoomIn()
        break
      case '-':
      case '_':
        event.preventDefault()
        session.zoomOut()
        break
      case '0':
        event.preventDefault()
        session.resetZoom()
        break
    }
  }

  if (session.status === 'idle' || session.status === 'loading') {
    return (
      <div className="pdf-status">
        <Spinner size="lg" label="Loading PDF" />
        <p className="pdf-status__title">Reading your PDF…</p>
        <p className="pdf-status__hint">Rendering happens on this device.</p>
      </div>
    )
  }

  if (session.status === 'error') {
    return (
      <div className="pdf-status">
        <Icon name="alert-triangle" size="xl" />
        <p className="pdf-status__title">This PDF could not be opened</p>
        <p className="pdf-status__hint">{session.error}</p>
        <Button
          variant="outline"
          onClick={() => void downloadDocument(document.id)}
        >
          Download file
        </Button>
      </div>
    )
  }

  const pageNumbers = Array.from(
    { length: session.numPages },
    (_, index) => index + 1,
  )

  return (
    <div className="pdf-viewer">
      <PdfToolbar
        document={document}
        containerSize={containerSize}
        onOpenInfo={() => setInfoOpen(true)}
        textEditing={textEditing}
        canEditText={editor.status === 'ready' && !editor.busy}
        onToggleTextEditing={() => {
          if (textEditing) textSelectionRef.current?.commit()
          setTextEditingState((current) => ({
            ...current,
            active: !current.active,
          }))
        }}
      />

      {textEditing ? (
        <PdfTextFormattingToolbar
          selection={textSelection}
          onChange={handleTextFormatChange}
          onReset={resetTextFormat}
          onCommit={commitTextSelection}
        />
      ) : null}

      <ScrollArea
        ref={(element) => {
          scrollerRef.current = element
          setScrollerElement(element)
        }}
        ariaLabel="PDF pages"
        className="pdf-scroller"
        onKeyDown={handleKeyDown}
      >
        {session.mode === 'single' ? (
          <div className="pdf-pages pdf-pages--single">
            <PdfPageSlot
              key={session.currentPage}
              pageNumber={session.currentPage}
              scaleFor={scaleFor}
              root={null}
              registerPage={(element) =>
                pageElementsRef.current.set(session.currentPage, element)
              }
              unregisterPage={() =>
                pageElementsRef.current.delete(session.currentPage)
              }
              textEditing={textEditing}
              onTextEdit={handleTextEdit}
              onTextSelectionChange={handleTextSelectionChange}
            />
          </div>
        ) : (
          <div className="pdf-pages pdf-pages--continuous">
            {pageNumbers.map((pageNumber) => (
              <PdfPageSlot
                key={pageNumber}
                pageNumber={pageNumber}
                scaleFor={scaleFor}
                root={scrollerElement}
                onVisible={session.reportVisiblePage}
                registerPage={(element) =>
                  pageElementsRef.current.set(pageNumber, element)
                }
                unregisterPage={() =>
                  pageElementsRef.current.delete(pageNumber)
                }
                textEditing={textEditing}
                onTextEdit={handleTextEdit}
                onTextSelectionChange={handleTextSelectionChange}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <PdfInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        document={document}
      />
    </div>
  )
}
