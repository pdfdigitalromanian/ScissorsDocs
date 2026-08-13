import { Fragment, useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { renderPdfPageToCanvas } from '@/features/pdf/pdfjs'
import { PdfThumbnails, usePdfSession } from '@/features/pdf'
import IconButton from '@/components/ui/IconButton'
import { useToast } from '@/components/ui'
import { downloadBlob } from '@/features/documents'
import { computeReorder } from '../engine'
import { usePdfEditor } from '../PdfEditorProvider'
import { useSettings } from '@/features/settings/SettingsProvider'
import { EditorDialogs } from './EditorDialogs'
import { ConfirmDialog } from './ConfirmDialog'
import type { EditorDialogId } from './EditorDialogs'
import '../editor.css'

const THUMBNAIL_WIDTH = 76
const DRAG_THRESHOLD = 4
const MAX_SCROLL_SPEED = 14
const EDGE_ZONE = 56

interface EditorThumbnailItemProps {
  pageNumber: number
  pageId: string
  selected: boolean
  active: boolean
  dragging: boolean
  onSelect: (pageId: string, event: MouseEvent<HTMLButtonElement>) => void
  onPointerDown: (
    event: PointerEvent<HTMLButtonElement>,
    pageId: string,
  ) => void
}

function EditorThumbnailItem({
  pageNumber,
  pageId,
  selected,
  active,
  dragging,
  onSelect,
  onPointerDown,
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
    dragging ? 'pdf-thumbnail--dragging' : '',
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
      onPointerDown={(event) => onPointerDown(event, pageId)}
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

interface ThumbDragState {
  pageId: string
  blockIndices: number[]
  pointerId: number
  clientY: number
}

/**
 * EditorThumbnails is the editable page strip for the current PDF: a
 * toolbar with page tools plus the lazy thumbnail grid. Pages are
 * selected (plain, range with Shift, toggle with Ctrl/Cmd) and the
 * selection drives Rotate, Move, Duplicate, Delete, Replace and Extract.
 * Thumbnails can also be dragged between positions — the grid auto-scrolls
 * near its edges and a drop indicator shows where the pages will land.
 * While the editor is not ready the read-only PdfThumbnails strip is
 * shown instead.
 */
export function EditorThumbnails() {
  const editor = usePdfEditor()
  const session = usePdfSession()
  const { toast } = useToast()
  const { settings } = useSettings()
  const [dialog, setDialog] = useState<EditorDialogId | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pendingPointerRef = useRef<{
    pageId: string
    x: number
    y: number
    pointerId: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const dragRef = useRef<ThumbDragState | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  const scrollParentRef = useRef<HTMLElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<ThumbDragState | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const selectionCount = editor.selectedPageIds.length
  const busy = editor.busy
  const selectionDisabled = busy || selectionCount === 0
  const [confirmDelete, setConfirmDelete] = useState(false)

  const requestDeletePages = () => {
    if (settings.general.deleteConfirmation) {
      setConfirmDelete(true)
      return
    }
    void editor.deleteSelected()
  }

  const handleSelect = (
    pageId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
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

  function findScrollParent(element: HTMLElement | null): HTMLElement | null {
    let node: HTMLElement | null = element
    while (node) {
      const style = getComputedStyle(node)
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight
      ) {
        return node
      }
      node = node.parentElement
    }
    return null
  }

  function computeDropSlot(clientY: number): number {
    const grid = gridRef.current
    if (!grid) return 0
    const items = Array.from(
      grid.querySelectorAll<HTMLElement>('.pdf-thumbnail'),
    )
    if (items.length === 0) return 0
    for (let index = 0; index < items.length; index += 1) {
      const rect = items[index].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return index
    }
    return items.length
  }

  function computeToIndex(blockIndices: number[], slot: number): number {
    const count = blockIndices.filter((index) => index < slot).length
    return Math.max(0, Math.min(slot - count, editor.pages.length))
  }

  function computeScrollSpeed(clientY: number): number {
    const parent = scrollParentRef.current
    if (!parent) return 0
    const rect = parent.getBoundingClientRect()
    if (clientY < rect.top + EDGE_ZONE) {
      return -((rect.top + EDGE_ZONE - clientY) / EDGE_ZONE) * MAX_SCROLL_SPEED
    }
    if (clientY > rect.bottom - EDGE_ZONE) {
      return (
        ((clientY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE) * MAX_SCROLL_SPEED
      )
    }
    return 0
  }

  function updateDropIndex(clientY: number) {
    const state = dragRef.current
    if (!state) return
    const slot = computeDropSlot(clientY)
    dropIndexRef.current = slot
    setDropIndex(slot)
    dragRef.current = { ...state, clientY }
    setDrag(dragRef.current)
  }

  function startAutoScroll() {
    const parent = findScrollParent(gridRef.current)
    scrollParentRef.current = parent
    if (!parent) return
    const tick = () => {
      const state = dragRef.current
      if (!state) {
        scrollFrameRef.current = null
        return
      }
      const parentElement = scrollParentRef.current
      const speed = computeScrollSpeed(state.clientY)
      if (parentElement && speed !== 0) {
        parentElement.scrollTop += speed
        const slot = computeDropSlot(state.clientY)
        if (slot !== dropIndexRef.current) {
          dropIndexRef.current = slot
          setDropIndex(slot)
        }
      }
      scrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
    }
    scrollFrameRef.current = window.requestAnimationFrame(tick)
  }

  function stopAutoScroll() {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
    scrollParentRef.current = null
  }

  function startDrag(
    pending: { pageId: string; pointerId: number },
    clientY: number,
  ) {
    const pageIndex = editor.pages.findIndex(
      (page) => page.id === pending.pageId,
    )
    if (pageIndex < 0) {
      pendingPointerRef.current = null
      return
    }
    const selectedIds = new Set(editor.selectedPageIds)
    let blockIndices: number[]
    if (selectedIds.has(pending.pageId)) {
      blockIndices = editor.pages
        .map((page, index) => (selectedIds.has(page.id) ? index : -1))
        .filter((index) => index >= 0)
    } else {
      blockIndices = [pageIndex]
      editor.selectPage(pending.pageId)
    }
    suppressClickRef.current = true
    const state: ThumbDragState = {
      pageId: pending.pageId,
      blockIndices,
      pointerId: pending.pointerId,
      clientY,
    }
    dragRef.current = state
    dropIndexRef.current = computeDropSlot(clientY)
    setDrag(state)
    setDropIndex(dropIndexRef.current)
    startAutoScroll()
  }

  function endDrag(commit: boolean) {
    const state = dragRef.current
    const slot = dropIndexRef.current
    dragRef.current = null
    dropIndexRef.current = null
    stopAutoScroll()
    setDrag(null)
    setDropIndex(null)
    if (commit && state && slot !== null && !busy) {
      const toIndex = computeToIndex(state.blockIndices, slot)
      const { order } = computeReorder(
        state.blockIndices,
        toIndex,
        editor.pages.length,
      )
      const unchanged = order.every((index, position) => index === position)
      if (!unchanged) {
        void editor.moveSelected(toIndex)
      }
    }
  }

  function handleThumbPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    pageId: string,
  ) {
    suppressClickRef.current = false
    if (busy) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.shiftKey || event.ctrlKey || event.metaKey) return
    pendingPointerRef.current = {
      pageId,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleGridPointerMove(event: PointerEvent<HTMLDivElement>) {
    const pending = pendingPointerRef.current
    if (pending && event.pointerId === pending.pointerId && !dragRef.current) {
      if (
        Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <
        DRAG_THRESHOLD
      ) {
        return
      }
      startDrag(pending, event.clientY)
      return
    }
    if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
      updateDropIndex(event.clientY)
    }
  }

  function handleGridPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
      endDrag(true)
    }
    pendingPointerRef.current = null
  }

  function handleGridPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
      suppressClickRef.current = false
      endDrag(false)
    }
    pendingPointerRef.current = null
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
            onClick={requestDeletePages}
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
          ref={gridRef}
          className={`editor-thumbnails__grid${drag ? ' editor-thumbnails__grid--dragging' : ''}`}
          role="list"
          aria-label="PDF page thumbnails"
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerCancel}
        >
          {editor.pages.map((page, index) => {
            const pageNumber = index + 1
            const insert = (
              <div className="editor-thumbnails__insert" aria-hidden="true" />
            )
            return (
              <Fragment key={pageNumber}>
                {dropIndex === index && insert}
                <EditorThumbnailItem
                  pageNumber={pageNumber}
                  pageId={page.id}
                  selected={editor.selectedPageIds.includes(page.id)}
                  active={session.currentPage === pageNumber}
                  dragging={drag?.pageId === page.id}
                  onSelect={handleSelect}
                  onPointerDown={handleThumbPointerDown}
                />
              </Fragment>
            )
          })}
          {dropIndex === editor.pages.length && (
            <div className="editor-thumbnails__insert" aria-hidden="true" />
          )}
        </div>
      </div>
      <EditorDialogs dialog={dialog} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete selected pages?"
        description={`${selectionCount} page${
          selectionCount === 1 ? '' : 's'
        } will be removed from the document.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false)
          void editor.deleteSelected()
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}
