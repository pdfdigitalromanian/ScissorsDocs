import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { renderPdfPageToCanvas } from '@/features/pdf/pdfjs'
import { PdfThumbnails, usePdfSession } from '@/features/pdf'
import IconButton from '@/components/ui/IconButton'
import { useToast } from '@/components/ui'
import { downloadBlob } from '@/features/documents'
import { usePdfEditor } from '../PdfEditorProvider'
import { EditorDialogs } from './EditorDialogs'
import type { EditorDialogId } from './EditorDialogs'
import '../editor.css'

const THUMBNAIL_WIDTH = 120

interface EditorThumbnailItemProps {
  pageNumber: number
  pageId: string
  selected: boolean
  active: boolean
  onSelect: (pageId: string, event: MouseEvent<HTMLButtonElement>) => void
}

function EditorThumbnailItem({
  pageNumber,
  pageId,
  selected,
  active,
  onSelect,
}: EditorThumbnailItemProps) {
  const session = usePdfSession()
  const wrapperRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    session.document
      ?.getPage(pageNumber)
      .then((loaded) => {
        if (!cancelled) setPage(loaded)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pageNumber, session.document])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true)
        else setVisible(false)
      },
      { rootMargin: '300px 0px', threshold: 0.01 },
    )
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible || !page || !canvas) return
    const base = page.getViewport({ scale: 1 })
    const scale = THUMBNAIL_WIDTH / base.width
    let task: RenderTask | null = null
    try {
      task = renderPdfPageToCanvas(canvas, page, scale)
      task.promise.catch(() => undefined)
    } catch {
      // Canvas unavailable — the thumbnail stays blank.
    }
    return () => task?.cancel()
  }, [visible, page])

  const classes = [
    'pdf-thumbnail',
    selected ? 'pdf-thumbnail--selected' : '',
    active ? 'pdf-thumbnail--active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={wrapperRef}
      type="button"
      aria-label={`Select page ${pageNumber}`}
      aria-pressed={selected}
      className={classes}
      onClick={(event) => onSelect(pageId, event)}
    >
      <span className="pdf-thumbnail__frame">
        <canvas
          ref={canvasRef}
          className="pdf-thumbnail__canvas"
          aria-hidden="true"
        />
      </span>
      <span className="pdf-thumbnail__number">{pageNumber}</span>
    </button>
  )
}

/**
 * EditorThumbnails is the editable page strip for the current PDF: a
 * toolbar with page tools plus the lazy thumbnail grid. Pages are
 * selected (plain, range with Shift, toggle with Ctrl/Cmd) and the
 * selection drives Rotate, Move, Duplicate, Delete, Replace and Extract.
 * While the editor is not ready the read-only PdfThumbnails strip is
 * shown instead.
 */
export function EditorThumbnails() {
  const editor = usePdfEditor()
  const session = usePdfSession()
  const { toast } = useToast()
  const [dialog, setDialog] = useState<EditorDialogId | null>(null)

  const selectionCount = editor.selectedPageIds.length
  const busy = editor.busy
  const selectionDisabled = busy || selectionCount === 0

  const handleSelect = (
    pageId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (event.shiftKey) {
      editor.selectRange(pageId)
    } else if (event.metaKey || event.ctrlKey) {
      editor.togglePage(pageId)
    } else {
      editor.selectPage(pageId)
    }
    const pageNumber =
      editor.pages.find((page) => page.id === pageId)?.index ?? -1
    if (pageNumber >= 0) session.goToPage(pageNumber + 1)
  }

  const handleExtract = async () => {
    const output = await editor.extractSelected()
    if (!output) return
    downloadBlob(
      new Blob([output.bytes as BlobPart], { type: 'application/pdf' }),
      output.name,
    )
    toast({
      title: 'Pages extracted',
      description: `${output.pageCount} page${output.pageCount === 1 ? '' : 's'} saved as "${output.name}".`,
      variant: 'success',
    })
  }

  if (editor.status === 'error') {
    return <p className="panel-region__hint">{editor.error}</p>
  }

  if (editor.status !== 'ready') {
    return <PdfThumbnails />
  }

  return (
    <>
      <div className="editor-thumbnails">
        <div
          className="editor-thumbnails__toolbar"
          role="toolbar"
          aria-label="Page tools"
        >
          <IconButton
            icon="plus"
            label="Insert pages"
            disabled={busy}
            onClick={() => setDialog('insert')}
          />
          <IconButton
            icon="edit"
            label="Replace page"
            disabled={selectionDisabled}
            onClick={() => setDialog('replace')}
          />
          <IconButton
            icon="rotate"
            label="Rotate clockwise"
            disabled={selectionDisabled}
            onClick={() => void editor.rotateSelected('clockwise')}
          />
          <IconButton
            icon="rotate"
            label="Rotate counter-clockwise"
            className="editor-thumbnails__icon-flip"
            disabled={selectionDisabled}
            onClick={() => void editor.rotateSelected('counter-clockwise')}
          />
          <IconButton
            icon="chevron-up"
            label="Move pages up"
            disabled={selectionDisabled}
            onClick={() => void editor.moveSelectedBy(-1)}
          />
          <IconButton
            icon="chevron-down"
            label="Move pages down"
            disabled={selectionDisabled}
            onClick={() => void editor.moveSelectedBy(1)}
          />
          <IconButton
            icon="copy"
            label="Duplicate pages"
            disabled={selectionDisabled}
            onClick={() => void editor.duplicateSelected()}
          />
          <IconButton
            icon="trash"
            label="Delete pages"
            disabled={selectionDisabled}
            onClick={() => void editor.deleteSelected()}
          />
          <IconButton
            icon="scissors"
            label="Extract pages"
            disabled={selectionDisabled}
            onClick={() => void handleExtract()}
          />
          <IconButton
            icon="split"
            label="Split document"
            disabled={busy}
            onClick={() => setDialog('split')}
          />
          <IconButton
            icon="merge"
            label="Merge documents"
            disabled={busy}
            onClick={() => setDialog('merge')}
          />
        </div>
        {selectionCount > 0 && (
          <p className="editor-thumbnails__summary">
            {selectionCount} of {editor.numPages} selected
          </p>
        )}
        <div
          className="editor-thumbnails__grid"
          role="list"
          aria-label="PDF page thumbnails"
        >
          {editor.pages.map((page, index) => (
            <EditorThumbnailItem
              key={page.id}
              pageNumber={index + 1}
              pageId={page.id}
              selected={editor.selectedPageIds.includes(page.id)}
              active={session.currentPage === index + 1}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
      <EditorDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </>
  )
}
