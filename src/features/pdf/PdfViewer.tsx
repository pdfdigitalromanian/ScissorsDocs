import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfTextEdit, SelectedTextRun } from '@/features/editor/model'
import { usePdfEditor } from '@/features/editor/PdfEditorProvider'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import { ScrollArea } from '@/components/layout'
import type { LocalDocument } from '@/features/documents'
import { downloadDocument } from '@/features/documents'
import { FILE_INPUT_ACCEPT, ingestFiles } from '@/features/documents'
import { useWorkspace } from '@/features/workspace/state/use-workspace'
import { EditorPageSurface } from '@/features/editor/EditorPageSurface'
import { EditorToolbar } from '@/features/editor/EditorToolbar'
import { SignToolbar } from '@/features/editor/components/SignToolbar'
import { PdfPageView } from './PdfPageView'
import { PdfInfoModal } from './PdfInfoModal'
import { registerBundledEditorFontFaces } from './text-format'
import type { PdfTextSelectionController } from './text-format'
import { MAX_ZOOM, MIN_ZOOM, usePdfSession } from './PdfSessionProvider'
import './pdf.css'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface ContainerSize {
  width: number
  height: number
}

/**
 * Padding around the page stack (`.pdf-pages` in pdf.css) that must be
 * subtracted from the scroller's measured size, or a "fit" page overflows
 * its container by exactly that padding and trips a scrollbar instead of
 * actually fitting. Read live from the DOM instead of hardcoded so it
 * stays correct across the mobile breakpoint, where the padding token
 * shrinks — this is just the pre-measurement fallback.
 */
interface PageInsets {
  x: number
  y: number
}

const DEFAULT_PAGE_INSETS: PageInsets = { x: 24, y: 24 }

/**
 * How long we assume a programmatic scrollIntoView takes to settle when
 * the browser doesn't support the 'scrollend' event. Smooth-scroll
 * duration is browser-controlled, not distance-proportional in most
 * engines, so this is a safe upper bound rather than a measured value.
 */
const NAVIGATE_SETTLE_FALLBACK_MS = 700

/**
 * Fit scale for the two automatic fit modes:
 *  - 'width': page width exactly fills the container width (minus the
 *    page stack's horizontal padding). Height is whatever it ends up
 *    being; the scroller handles vertical overflow.
 *  - 'page': the whole page fits inside the container in BOTH directions
 *    at once (minus the page stack's padding on each axis) — the same
 *    "fit page" behavior as iLovePDF/Acrobat. Whichever dimension is more
 *    constraining (usually height for portrait pages, width for landscape
 *    ones) determines the scale, so neither axis overflows or scrolls.
 */
function fitScale(
  container: ContainerSize,
  insets: PageInsets,
  page: PDFPageProxy,
  mode: 'width' | 'page',
): number {
  const base = page.getViewport({ scale: 1 })
  const availableWidth = Math.max(container.width - insets.x, 1)

  if (mode === 'width') {
    return availableWidth / base.width
  }

  const availableHeight = Math.max(container.height - insets.y, 1)
  const widthScale = availableWidth / base.width
  const heightScale = availableHeight / base.height
  return Math.min(widthScale, heightScale)
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
  onTransformCommit?: (edit: PdfTextEdit) => void
  onTextSelectionChange: (selection: PdfTextSelectionController | null) => void
  onSelectedRunChange?: (run: SelectedTextRun | null) => void
  onDeleteRun?: (edit: PdfTextEdit) => void
  overlay?: (page: PDFPageProxy, scale: number) => ReactNode
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
  onTransformCommit,
  onTextSelectionChange,
  onSelectedRunChange,
  onDeleteRun,
  overlay,
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
          onTransformCommit={onTransformCommit}
          onTextSelectionChange={onTextSelectionChange}
          onSelectedRunChange={onSelectedRunChange}
          onDeleteRun={onDeleteRun}
          overlay={overlay?.(page, scaleFor(page))}
        />
      ) : (
        <div className="pdf-page-slot__placeholder" />
      )}
    </div>
  )
}

function OpenButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { openLocalDocuments } = useWorkspace()
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    setBusy(true)
    try {
      const results = await ingestFiles(files)
      const registered = results.filter((result) => result.document !== null)
      const failed = results.filter((result) => result.error !== null)

      if (failed.length > 0) {
        toast({
          title:
            failed.length === 1
              ? 'A file could not be opened'
              : `${failed.length} files could not be opened`,
          description: failed[0].error ?? 'The file could not be read.',
          variant: 'error',
        })
      }

      if (registered.length > 0) {
        openLocalDocuments(registered.map((result) => result.document!))
        if (registered.length > 1) {
          toast({
            title: 'Documents opened',
            description: `${registered.length} documents were opened as workspace tabs.`,
            variant: 'success',
          })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void handleFiles(files)
  }

  return (
    <>
      <IconButton
        icon="file"
        label={busy ? 'Opening…' : 'Open a file'}
        iconSize="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />
    </>
  )
}

function PdfToolbar({
  document,
  containerSize,
  pageInsets,
  onOpenInfo,
}: {
  document: LocalDocument
  containerSize: ContainerSize
  pageInsets: PageInsets
  onOpenInfo: () => void
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
        if (session.fitMode === 'manual') {
          setDisplayScale(session.zoom)
          return
        }
        if (containerSize.width <= 0) return
        setDisplayScale(
          fitScale(containerSize, pageInsets, page, session.fitMode),
        )
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
    pageInsets,
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
          icon={session.fitMode === 'page' ? 'fit-width' : 'fit-page'}
          label={session.fitMode === 'page' ? 'Fit to width' : 'Fit to page'}
          iconSize="sm"
          onClick={() =>
            session.setFitMode(session.fitMode === 'page' ? 'width' : 'page')
          }
        />
      </div>

      <div className="pdf-toolbar__group">
        <IconButton
          icon={session.mode === 'continuous' ? 'page' : 'rows'}
          label={
            session.mode === 'continuous'
              ? 'Switch to single page view'
              : 'Switch to continuous scroll'
          }
          iconSize="sm"
          onClick={() =>
            session.setMode(
              session.mode === 'continuous' ? 'single' : 'continuous',
            )
          }
        />
      </div>

      <div className="pdf-toolbar__group">
        <OpenButton />
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

      <div className="pdf-toolbar__group">
        <SaveButton />
      </div>
    </div>
  )
}

function SaveButton() {
  const { save, saveState } = usePdfEditor()
  const { toast } = useToast()
  const dirty = saveState === 'unsaved'
  const saving = saveState === 'saving'
  return (
    <IconButton
      icon="check"
      label={
        saving
          ? 'Saving changes…'
          : dirty
            ? 'Save changes'
            : 'All changes saved'
      }
      iconSize="sm"
      disabled={!dirty}
      onClick={async () => {
        const result = await save()
        if (result.error) {
          toast({ title: 'Save failed', description: result.error, variant: 'error' })
        } else {
          toast({ title: 'Changes saved', variant: 'success' })
        }
      }}
    />
  )
}

interface PdfViewerProps {
  document: LocalDocument
}

/**
 * PdfViewer is the real local PDF engine surface: an accessible toolbar
 * (page navigation, zoom, fit, view mode, document information, download)
 * and a lazy page scroller. Edit text, edit content and the page tools
 * live in the document action bar instead (see WorkspaceActionBar). It
 * consumes the shared PDF session so the thumbnail panel stays in sync.
 */
export function PdfViewer({ document }: PdfViewerProps) {
  const [searchParams] = useSearchParams()
  const session = usePdfSession()
  const editor = usePdfEditor()
  const { toast } = useToast()
  const [infoOpen, setInfoOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [scrollerElement, setScrollerElement] = useState<HTMLDivElement | null>(
    null,
  )
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map())
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
  })
  const [pageInsets, setPageInsets] = useState<PageInsets>(DEFAULT_PAGE_INSETS)
  const requestedTextEditing = searchParams.get('tool') === 'edit-text'
  const { textEditing, setTextEditing, reportVisiblePage } = usePdfSession()

  /**
   * True while a click-triggered scrollIntoView (from goToPage/next/
   * previous) is still animating. While this is set, the per-page
   * IntersectionObserver's "visible" reports are ignored — otherwise the
   * observer fires for every page scrolled *past* during the smooth-
   * scroll animation, and whichever fires last (not necessarily the
   * actual clicked target) silently overwrites currentPage. This is what
   * caused clicking "page 2" to sometimes land the UI on page 3 or 4.
   */
  const navigatingRef = useRef(false)
  const navigateTimeoutRef = useRef<number | null>(null)

  /* The URL may carry ?tool=edit-text (deep link into text mode). Sync the
   * session flag when that param changes, but never fight the user's own
   * toggle once they turn editing off. Initialized to `false` — not to the
   * current param — so a fresh mount with ?tool=edit-text actually enables
   * editing on first load; otherwise the effect's early-return sees the
   * ref already equal to the param and skips the sync entirely. */
  const lastRequestedEditingRef = useRef(false)
  useEffect(() => {
    if (lastRequestedEditingRef.current === requestedTextEditing) return
    lastRequestedEditingRef.current = requestedTextEditing
    setTextEditing(requestedTextEditing)
  }, [requestedTextEditing, setTextEditing])

  /* Content-only edits (text replacements) intentionally don't refresh
   * the live pdf.js viewer/thumbnails in real time — see
   * applyContentOnlyMutation in PdfEditorProvider. Turning text-edit mode
   * off is a natural, deliberate "I'm done for now" checkpoint, so resync
   * here regardless of which control flips the flag. */
  const wasTextEditingRef = useRef(textEditing)
  useEffect(() => {
    if (wasTextEditingRef.current && !textEditing) {
      editor.syncViewer()
    }
    wasTextEditingRef.current = textEditing
  }, [textEditing, editor])

  useEffect(() => {
    registerBundledEditorFontFaces()
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

  const handleDeleteText = useCallback(
    (edit: PdfTextEdit) => {
      void editor
        .deleteText(edit)
        .then(() => editor.syncViewer())
        .catch((reason: unknown) => {
          toast({
            title: 'Text could not be deleted',
            description:
              reason instanceof Error
                ? reason.message
                : 'This text run could not be removed from the PDF.',
            variant: 'error',
          })
        })
    },
    [editor, toast],
  )

  /** Move/resize/rotate commits re-write the run, then resync the live
   * viewer so the displacement is immediately visible (text edits normally
   * refresh only when text-edit mode is turned off). */
  const handleTransformCommit = useCallback(
    (edit: PdfTextEdit) => {
      void editor
        .replaceText(edit)
        .then(() => editor.syncViewer())
        .catch((reason: unknown) => {
          toast({
            title: 'Text could not be moved',
            description:
              reason instanceof Error
                ? reason.message
                : 'This text run could not be repositioned in the PDF.',
            variant: 'error',
          })
        })
    },
    [editor, toast],
  )

  /**
   * Measures the scroller's visible size and the page stack's own padding
   * directly from the DOM. Reading the padding live (instead of assuming a
   * fixed pixel value) keeps fit-to-width/fit-to-page accurate across the
   * mobile breakpoint, where `.pdf-pages` padding shrinks.
   */
  const measure = useCallback(() => {
    const scroller = scrollerRef.current
    if (scroller) {
      setContainerSize({
        width: scroller.clientWidth,
        height: scroller.clientHeight,
      })
    }
    const pages = pagesRef.current
    if (pages) {
      const style = window.getComputedStyle(pages)
      const x =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight)
      const y =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom)
      setPageInsets({
        x: Number.isFinite(x) ? x : DEFAULT_PAGE_INSETS.x,
        y: Number.isFinite(y) ? y : DEFAULT_PAGE_INSETS.y,
      })
    }
  }, [])

  /**
   * Attaches the resize observer through a callback ref instead of a
   * mount-time effect. The scroller only exists once the PDF has finished
   * loading, and this component stays mounted across that loading → ready
   * transition (it's keyed by document id, not by session status). An
   * effect with an empty dependency array runs before the scroller exists
   * and never re-attaches once it does — that left the measured size
   * stuck at 0 forever and every "fit" mode silently falling back to
   * 100% scale. A callback ref fires exactly when the real DOM node
   * mounts, so this works regardless of what triggered the render that
   * produced it.
   */
  const attachScroller = useCallback(
    (element: HTMLDivElement | null) => {
      scrollerRef.current = element
      setScrollerElement(element)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (!element) return
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      resizeObserverRef.current = observer
    },
    [measure],
  )

  const attachPages = useCallback(
    (element: HTMLDivElement | null) => {
      pagesRef.current = element
      if (element) measure()
    },
    [measure],
  )

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (navigateTimeoutRef.current !== null) {
        window.clearTimeout(navigateTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!session.scrollTarget || session.mode !== 'continuous') return
    const target = pageElementsRef.current.get(session.scrollTarget.page)
    if (!target) return

    navigatingRef.current = true
    if (navigateTimeoutRef.current !== null) {
      window.clearTimeout(navigateTimeoutRef.current)
      navigateTimeoutRef.current = null
    }

    const scroller = scrollerRef.current
    const supportsScrollEnd = Boolean(scroller && 'onscrollend' in scroller)

    const clearNavigating = () => {
      navigatingRef.current = false
      if (navigateTimeoutRef.current !== null) {
        window.clearTimeout(navigateTimeoutRef.current)
        navigateTimeoutRef.current = null
      }
      scroller?.removeEventListener('scrollend', clearNavigating)
    }

    if (supportsScrollEnd) {
      scroller?.addEventListener('scrollend', clearNavigating, { once: true })
    }
    /* Fallback for browsers without 'scrollend', and a safety net in case
     * the target was already in view (scrollend then never fires). */
    navigateTimeoutRef.current = window.setTimeout(
      clearNavigating,
      NAVIGATE_SETTLE_FALLBACK_MS,
    )

    target.scrollIntoView({ block: 'start' })

    return () => {
      scroller?.removeEventListener('scrollend', clearNavigating)
    }
  }, [session.scrollTarget, session.mode])

  /** Ignores intersection-based page reports while a click navigation is
   * still animating — see `navigatingRef` above. */
  const handlePageVisible = useCallback(
    (page: number) => {
      if (navigatingRef.current) return
      reportVisiblePage(page)
    },
    [reportVisiblePage],
  )

  const scaleFor = useCallback(
    (page: PDFPageProxy): number => {
      if (session.fitMode === 'manual') {
        return clamp(session.zoom, MIN_ZOOM, MAX_ZOOM)
      }
      if (containerSize.width <= 0 || containerSize.height <= 0) return 1
      /* Fit scales are NOT clamped to the manual zoom range — clamping
         overflowed large pages (a fitting scale below MIN_ZOOM was pinned
         to 0.25, so the page never fit its container). */
      return fitScale(containerSize, pageInsets, page, session.fitMode)
    },
    [session.fitMode, session.zoom, containerSize, pageInsets],
  )

  const { editMode, signMode } = usePdfEditor()

  const renderEditorOverlay = useCallback(
    (page: PDFPageProxy, scale: number): ReactNode => {
      if (!editMode && !signMode) return null
      const base = page.getViewport({ scale: 1 })
      return (
        <EditorPageSurface
          pageIndex={page.pageNumber - 1}
          pageWidth={base.width}
          pageHeight={base.height}
          scale={scale}
        />
      )
    },
    [editMode, signMode],
  )

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return
    }
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
        pageInsets={pageInsets}
        onOpenInfo={() => setInfoOpen(true)}
      />

      {editMode && <EditorToolbar watermarkPage={session.currentPage - 1} />}
      {signMode && <SignToolbar />}

      <ScrollArea
        ref={attachScroller}
        ariaLabel="PDF pages"
        className="pdf-scroller"
        onKeyDown={handleKeyDown}
      >
        {session.mode === 'single' ? (
          <div className="pdf-pages pdf-pages--single" ref={attachPages}>
            <PdfPageSlot
              key={session.currentPage}
              pageNumber={session.currentPage}
              scaleFor={scaleFor}
              root={null}
              overlay={renderEditorOverlay}
              registerPage={(element) =>
                pageElementsRef.current.set(session.currentPage, element)
              }
              unregisterPage={() =>
                pageElementsRef.current.delete(session.currentPage)
              }
              textEditing={textEditing}
              onTextEdit={handleTextEdit}
              onTransformCommit={handleTransformCommit}
              onTextSelectionChange={session.setTextSelection}
              onDeleteRun={handleDeleteText}
            />
          </div>
        ) : (
          <div className="pdf-pages pdf-pages--continuous" ref={attachPages}>
            {pageNumbers.map((pageNumber) => (
              <PdfPageSlot
                key={pageNumber}
                pageNumber={pageNumber}
                scaleFor={scaleFor}
                root={scrollerElement}
                onVisible={handlePageVisible}
                overlay={renderEditorOverlay}
                registerPage={(element) =>
                  pageElementsRef.current.set(pageNumber, element)
                }
                unregisterPage={() =>
                  pageElementsRef.current.delete(pageNumber)
                }
                textEditing={textEditing}
                onTextEdit={handleTextEdit}
                onTransformCommit={handleTransformCommit}
                onTextSelectionChange={session.setTextSelection}
                onDeleteRun={handleDeleteText}
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