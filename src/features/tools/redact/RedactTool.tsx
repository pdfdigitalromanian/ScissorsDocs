import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { Icon } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usePdfDocument } from '../stage/usePdfDocument'
import { useCurrentPage } from '../stage/useCurrentPage'
import PdfStage from '../stage/PdfStage'
import UploadDrop from '../organize/components/UploadDrop'
import OrganizeResult from '../organize/components/OrganizeResult'
import type { OrganizeOutput } from '../organize/lib'
import { redactPdf, type RedactionRect } from './redaction-lib'

type SelectionMode = 'rect' | 'text'

interface DrawState {
  startCssX: number
  startCssY: number
  curCssX: number
  curCssY: number
}

type ResizeHandle = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l'

const RESIZE_HANDLES: ResizeHandle[] = [
  'tl',
  't',
  'tr',
  'r',
  'br',
  'b',
  'bl',
  'l',
]

interface DragState {
  type: 'move' | 'resize'
  rectId: string
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  /** Viewport-space position of the corner/edge that stays fixed during resize. */
  fixedCss: { x: number; y: number } | null
  /** Viewport-space position of the grabbed corner/edge at drag start. */
  movingCss: { x: number; y: number } | null
  scale: number
}

interface TextItemPdf {
  id: string
  str: string
  x: number
  y: number
  width: number
  height: number
}

const MIN_RECT_SIZE = 8
/** A pointer drag smaller than this (in CSS px) is treated as a click. */
const CLICK_TOLERANCE = 4

/** Clamps an axis so the dragged edge maintains a minimum rect size. */
function clampAxis(
  min: number,
  max: number,
  movingFromFixed: boolean,
): { min: number; max: number } {
  if (max - min < MIN_RECT_SIZE) {
    if (movingFromFixed) max = min + MIN_RECT_SIZE
    else min = max - MIN_RECT_SIZE
  }
  return { min, max }
}

export default function RedactTool() {
  const { session, loading, error, load, clear } = usePdfDocument()
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [mode, setMode] = useState<SelectionMode>('rect')
  const [redactions, setRedactions] = useState<RedactionRect[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textItems, setTextItems] = useState<TextItemPdf[]>([])
  const [removeMetadata, setRemoveMetadata] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [workError, setWorkError] = useState('')
  const [outputs, setOutputs] = useState<OrganizeOutput[] | null>(null)
  const [resultWarnings, setResultWarnings] = useState<string[]>([])
  const stageRef = useRef<HTMLDivElement>(null)
  const catcherRef = useRef<HTMLDivElement | null>(null)
  const drawRef = useRef<DrawState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const page = useCurrentPage(session, pageIndex)
  const pageCount = session?.pageCount ?? 0
  const viewport = page ? page.getViewport({ scale }) : null

  useEffect(() => {
    setPageIndex(0)
    setRedactions([])
    setSelectedId(null)
    setTextItems([])
    setOutputs(null)
    setWorkError('')
    setResultWarnings([])
  }, [session])

  useEffect(() => {
    if (!page) return
    const wrapper = stageRef.current
    const available = Math.max(320, (wrapper?.clientWidth ?? 800) - 48)
    const maxHeight = Math.max(320, window.innerHeight * 0.68)
    const fit = Math.min(
      2.2,
      Math.max(0.4, Math.min(available / viewportWidth(page), maxHeight / viewportHeight(page))),
    )
    setScale(fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function viewportWidth(pageProxy: PDFPageProxy): number {
    return pageProxy.getViewport({ scale: 1 }).width
  }
  function viewportHeight(pageProxy: PDFPageProxy): number {
    return pageProxy.getViewport({ scale: 1 }).height
  }

  // ── Text layer for word-level selection ─────────────────────────────

  useEffect(() => {
    let cancelled = false
    setTextItems([])
    if (!page) return
    void (async () => {
      try {
        const content = await page.getTextContent()
        if (cancelled) return
        const items: TextItemPdf[] = []
        for (const raw of content.items) {
          if (!('str' in raw) || !('transform' in raw)) continue
          const transform = raw.transform as number[]
          const width = 'width' in raw ? Number(raw.width) : 0
          const height = Math.abs(transform[3] ?? transform[0] ?? 0)
          const str = raw.str.trim()
          if (!str || width <= 0 || height <= 0) continue
          items.push({
            id: `t-${items.length}`,
            str,
            x: transform[4],
            y: transform[5],
            width,
            height,
          })
        }
        setTextItems(items)
      } catch {
        // Text extraction is best-effort; rectangle mode still works.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page])

  // ── Geometry helpers ────────────────────────────────────────────────

  function overlayPoint(clientX: number, clientY: number): { x: number; y: number } {
    /* The catcher covers the rendered page exactly (inset: 0), so its
       bounding box is the page origin. Using the scroll container here
       would offset marks by its padding + centering. */
    const rect = catcherRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }

  function addRect(rect: RedactionRect) {
    setRedactions((current) => [...current, rect])
    setSelectedId(rect.id)
  }

  function updateRect(id: string, updates: Partial<RedactionRect>) {
    setRedactions((current) =>
      current.map((rect) => (rect.id === id ? { ...rect, ...updates } : rect)),
    )
  }

  function deleteRect(id: string) {
    setRedactions((current) => current.filter((rect) => rect.id !== id))
    setSelectedId(null)
  }

  function cancelSelection() {
    endDrag()
    cancelDraw()
    setSelectedId(null)
  }

  function cancelDraw() {
    window.removeEventListener('pointermove', handleDrawMove)
    window.removeEventListener('pointerup', handleDrawEnd)
    window.removeEventListener('pointercancel', handleDrawEnd)
    drawRef.current = null
    setRedactions((current) => current.filter((rect) => rect.id !== '__preview'))
  }

  // ── Rectangle drawing ───────────────────────────────────────────────

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (event.currentTarget !== event.target) return
    if (mode !== 'rect' || !viewport) return
    setWorkError('')
    setSelectedId(null)
    const point = overlayPoint(event.clientX, event.clientY)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort.
    }
    drawRef.current = {
      startCssX: point.x,
      startCssY: point.y,
      curCssX: point.x,
      curCssY: point.y,
    }
    window.addEventListener('pointermove', handleDrawMove)
    window.addEventListener('pointerup', handleDrawEnd)
    window.addEventListener('pointercancel', handleDrawEnd)
  }

  function handleDrawMove(event: PointerEvent) {
    const draw = drawRef.current
    if (!draw) return
    const point = overlayPoint(event.clientX, event.clientY)
    draw.curCssX = point.x
    draw.curCssY = point.y
    setRedactions((current) => {
      const preview = current.find((rect) => rect.id === '__preview')
      const next = previewRect(draw)
      if (preview) {
        return current.map((rect) =>
          rect.id === '__preview' ? next : rect,
        )
      }
      return [...current, next]
    })
    setSelectedId(null)
  }

  function previewRect(draw: DrawState): RedactionRect {
    return {
      id: '__preview',
      pageIndex,
      x: Math.min(draw.startCssX, draw.curCssX),
      y: Math.min(draw.startCssY, draw.curCssY),
      width: Math.abs(draw.curCssX - draw.startCssX),
      height: Math.abs(draw.curCssY - draw.startCssY),
    }
  }

  function handleDrawEnd() {
    const draw = drawRef.current
    window.removeEventListener('pointermove', handleDrawMove)
    window.removeEventListener('pointerup', handleDrawEnd)
    window.removeEventListener('pointercancel', handleDrawEnd)
    drawRef.current = null
    if (!draw || !viewport) {
      // Never leave a stuck preview behind if we cannot commit it.
      setRedactions((current) => current.filter((rect) => rect.id !== '__preview'))
      return
    }
    setRedactions((current) => {
      const rest = current.filter((rect) => rect.id !== '__preview')
      let cssW = Math.abs(draw.curCssX - draw.startCssX)
      let cssH = Math.abs(draw.curCssY - draw.startCssY)
      // A pure click (no real drag) just clears the preview.
      if (cssW < CLICK_TOLERANCE && cssH < CLICK_TOLERANCE) return rest
      // Clamp small drags up to a usable minimum instead of silently dropping them.
      cssW = Math.max(cssW, MIN_RECT_SIZE)
      cssH = Math.max(cssH, MIN_RECT_SIZE)
      const [x0, y0] = viewport.convertToPdfPoint(
        Math.min(draw.startCssX, draw.curCssX),
        Math.min(draw.startCssY, draw.curCssY),
      )
      const [x1, y1] = viewport.convertToPdfPoint(
        Math.min(draw.startCssX, draw.curCssX) + cssW,
        Math.min(draw.startCssY, draw.curCssY) + cssH,
      )
      const rect: RedactionRect = {
        id: `redact-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        pageIndex,
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      }
      setSelectedId(rect.id)
      return [...rest, rect]
    })
  }

  // ── Text selection ──────────────────────────────────────────────────

  function handleTextItemClick(item: TextItemPdf) {
    const pad = 2
    addRect({
      id: `redact-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      pageIndex,
      x: item.x - pad,
      y: item.y - pad,
      width: item.width + pad * 2,
      height: item.height + pad * 2,
    })
  }

  // ── Rect manipulation (move / resize / delete) ──────────────────────

  function beginDrag(drag: DragState) {
    dragRef.current = drag
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', handleDragEnd)
    window.addEventListener('pointercancel', handleDragEnd)
  }

  function endDrag() {
    dragRef.current = null
    window.removeEventListener('pointermove', handleDragMove)
    window.removeEventListener('pointerup', handleDragEnd)
    window.removeEventListener('pointercancel', handleDragEnd)
  }

  function handleDragMove(event: PointerEvent) {
    const drag = dragRef.current
    if (!drag || !viewport) return
    const delta = {
      x: event.clientX - drag.startClientX,
      y: event.clientY - drag.startClientY,
    }
    if (drag.type === 'move') {
      updateRect(drag.rectId, {
        x: drag.startX + delta.x / drag.scale,
        y: drag.startY - delta.y / drag.scale,
      })
      return
    }
    if (!drag.fixedCss || !drag.movingCss) return
    let left = Math.min(drag.fixedCss.x, drag.movingCss.x + delta.x)
    let top = Math.min(drag.fixedCss.y, drag.movingCss.y + delta.y)
    let right = Math.max(drag.fixedCss.x, drag.movingCss.x + delta.x)
    let bottom = Math.max(drag.fixedCss.y, drag.movingCss.y + delta.y)
    // Clamp to a minimum size instead of silently freezing the drag.
    const movingXRight = drag.movingCss.x + delta.x > drag.fixedCss.x
    const movingYDown = drag.movingCss.y + delta.y > drag.fixedCss.y
    const ax = clampAxis(left, right, movingXRight)
    left = ax.min
    right = ax.max
    const ay = clampAxis(top, bottom, movingYDown)
    top = ay.min
    bottom = ay.max
    const [x0, y0] = viewport.convertToPdfPoint(left, top)
    const [x1, y1] = viewport.convertToPdfPoint(right, bottom)
    updateRect(drag.rectId, {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    })
  }

  function handleDragEnd() {
    endDrag()
  }

  function handleRectPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    rect: RedactionRect,
  ) {
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort.
    }
    setSelectedId(rect.id)
    beginDrag({
      type: 'move',
      rectId: rect.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: rect.x,
      startY: rect.y,
      startWidth: rect.width,
      startHeight: rect.height,
      fixedCss: null,
      movingCss: null,
      scale,
    })
  }

  function cornerViewport(
    rect: RedactionRect,
    corner: 'tl' | 'tr' | 'bl' | 'br',
  ): { x: number; y: number } {
    if (!viewport) return { x: 0, y: 0 }
    const bl = viewport.convertToViewportPoint(rect.x, rect.y)
    const tr = viewport.convertToViewportPoint(
      rect.x + rect.width,
      rect.y + rect.height,
    )
    switch (corner) {
      case 'tl':
        return { x: bl[0], y: tr[1] }
      case 'tr':
        return { x: tr[0], y: tr[1] }
      case 'bl':
        return { x: bl[0], y: bl[1] }
      case 'br':
        return { x: tr[0], y: bl[1] }
    }
  }

  function handleViewport(rect: RedactionRect, handle: ResizeHandle): { x: number; y: number } {
    const top = cornerViewport(rect, 'tl').y
    const bottom = cornerViewport(rect, 'bl').y
    const left = cornerViewport(rect, 'tl').x
    const right = cornerViewport(rect, 'tr').x
    const centerX = (left + right) / 2
    const centerY = (top + bottom) / 2
    switch (handle) {
      case 'tl':
        return { x: left, y: top }
      case 't':
        return { x: centerX, y: top }
      case 'tr':
        return { x: right, y: top }
      case 'r':
        return { x: right, y: centerY }
      case 'br':
        return { x: right, y: bottom }
      case 'b':
        return { x: centerX, y: bottom }
      case 'bl':
        return { x: left, y: bottom }
      case 'l':
        return { x: left, y: centerY }
    }
  }

  function handleHandlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    rect: RedactionRect,
    handle: ResizeHandle,
  ) {
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best-effort.
    }
    const fixed = {
      tl: 'br',
      t: 'b',
      tr: 'bl',
      r: 'l',
      br: 'tl',
      b: 't',
      bl: 'tr',
      l: 'r',
    } as const
    beginDrag({
      type: 'resize',
      rectId: rect.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: rect.x,
      startY: rect.y,
      startWidth: rect.width,
      startHeight: rect.height,
      fixedCss: handleViewport(rect, fixed[handle]),
      movingCss: handleViewport(rect, handle),
      scale,
    })
  }

  useEffect(
    () => () => {
      endDrag()
      window.removeEventListener('pointermove', handleDrawMove)
      window.removeEventListener('pointerup', handleDrawEnd)
      window.removeEventListener('pointercancel', handleDrawEnd)
    },
    [],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (drawRef.current) {
          cancelDraw()
        } else if (selectedId) {
          setSelectedId(null)
        }
        return
      }
      if (!selectedId) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteRect(selectedId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId])

  // ── Apply ───────────────────────────────────────────────────────────

  async function handleApply() {
    if (!session) return
    setProcessing(true)
    setWorkError('')
    setResultWarnings([])
    try {
      /* Never send the in-flight preview rect to the engine — only marks
         the user actually released count. */
      const committed = redactions.filter((rect) => rect.id !== '__preview')
      if (committed.length === 0) {
        setWorkError(
          'Mark at least one area to redact before applying — drag a rectangle over content, or switch to Text mode and click words.',
        )
        return
      }
      const result = await redactPdf(session.bytes, committed, { removeMetadata })
      const baseName = session.file.name.replace(/\.pdf$/i, '') || 'document'
      setResultWarnings(result.stats.warnings)
      setOutputs([
        {
          filename: `${baseName}-redacted.pdf`,
          bytes: result.bytes,
          pages: result.pageCount,
        },
      ])
    } catch (reason) {
      setWorkError(
        reason instanceof Error
          ? reason.message
          : 'The PDF could not be redacted.',
      )
    } finally {
      setProcessing(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (outputs) {
    return (
      <OrganizeResult
        outputs={outputs}
        warnings={resultWarnings}
        onStartAnother={() => {
          setOutputs(null)
          clear()
        }}
      />
    )
  }

  if (!session) {
    return (
      <div className="organize-workflow">
        <section className="organize-section">
          <div className="organize-section__heading">
            <h2>Upload PDF</h2>
            <p>Choose the document you want to redact.</p>
          </div>
          <UploadDrop
            title="Drag & drop a PDF here"
            subtitle="Everything happens locally in your browser — nothing is uploaded."
            accept=".pdf,application/pdf"
            onFiles={(files) => {
              const pdf = files.find(
                (file) =>
                  file.type === 'application/pdf' ||
                  file.name.toLowerCase().endsWith('.pdf'),
              )
              if (pdf) load(pdf)
            }}
          />
        </section>
        {error ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {error}
          </div>
        ) : null}
      </div>
    )
  }

  const currentRects = redactions.filter((rect) => rect.pageIndex === pageIndex)
  const committedCount = redactions.filter((rect) => rect.id !== '__preview').length

  return (
    <div className="organize-workflow redact-workflow">
      <section className="organize-section">
        <div className="organize-section__heading">
          <h2>Mark content to redact</h2>
          <p>
            Draw a rectangle over sensitive content, or switch to{" "}
            <strong>text</strong> mode and click words. Redaction permanently
            removes the covered content, not just the black mark.
          </p>
        </div>

        <div className="redact-toolbar">
          <div className="redact-toolbar__modes" role="group" aria-label="Selection mode">
            <button
              type="button"
              className={`redact-mode${mode === 'rect' ? ' redact-mode--active' : ''}`}
              onClick={() => setMode('rect')}
            >
              <Icon name="square" size="sm" aria-hidden="true" />
              Rectangle
            </button>
            <button
              type="button"
              className={`redact-mode${mode === 'text' ? ' redact-mode--active' : ''}`}
              onClick={() => setMode('text')}
            >
              <Icon name="text" size="sm" aria-hidden="true" />
              Text
            </button>
          </div>
          <div className="redact-toolbar__pages">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
              aria-label="Previous page"
            >
              <Icon name="chevron-left" size="sm" aria-hidden="true" />
            </Button>
            <span className="redact-toolbar__label">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageIndex >= pageCount - 1}
              onClick={() =>
                setPageIndex((index) => Math.min(pageCount - 1, index + 1))
              }
              aria-label="Next page"
            >
              <Icon name="chevron-right" size="sm" aria-hidden="true" />
            </Button>
          </div>
          <div className="redact-toolbar__zoom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScale((value) => Math.max(0.3, value * 0.8))}
              aria-label="Zoom out"
            >
              <Icon name="zoom-out" size="sm" aria-hidden="true" />
            </Button>
            <span className="redact-toolbar__label">{Math.round(scale * 100)}%</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScale((value) => Math.min(4, value * 1.2))}
              aria-label="Zoom in"
            >
              <Icon name="zoom-in" size="sm" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="redact-stage__scroll" ref={stageRef}>
          {loading ? (
            <div className="organize-loading" role="status">
              <Spinner size="sm" label="" /> Reading pages…
            </div>
          ) : page && viewport ? (
            <PdfStage page={page} scale={scale}>
              <div
                className="redact-stage__catcher"
                ref={catcherRef}
                onPointerDown={handleStagePointerDown}
              />
              {mode === 'text'
                ? textItems.map((item) => {
                    const [x0, y0] = viewport.convertToViewportPoint(item.x, item.y)
                    const [x1, y1] = viewport.convertToViewportPoint(
                      item.x + item.width,
                      item.y + item.height,
                    )
                    const left = Math.min(x0, x1)
                    const top = Math.min(y0, y1)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="redact-text-item"
                        style={{
                          left,
                          top,
                          width: Math.max(2, Math.abs(x1 - x0)),
                          height: Math.max(2, Math.abs(y1 - y0)),
                        }}
                        title={`Redact "${item.str}"`}
                        onClick={() => handleTextItemClick(item)}
                        aria-label={`Redact "${item.str}"`}
                      />
                    )
                  })
                : null}
              {currentRects.map((rect) => {
                const [x0, y0] = viewport.convertToViewportPoint(rect.x, rect.y)
                const [x1, y1] = viewport.convertToViewportPoint(
                  rect.x + rect.width,
                  rect.y + rect.height,
                )
                const left = Math.min(x0, x1)
                const top = Math.min(y0, y1)
                const width = Math.abs(x1 - x0)
                const height = Math.abs(y1 - y0)
                const selected = selectedId === rect.id
                if (rect.id === '__preview') {
                  return (
                    <div
                      key={rect.id}
                      className="redact-rect redact-rect--preview"
                      style={{
                        left: rect.x,
                        top: rect.y,
                        width: rect.width,
                        height: rect.height,
                      }}
                    />
                  )
                }
                return (
                  <div
                    key={rect.id}
                    className={`redact-rect${selected ? ' redact-rect--selected' : ''}`}
                    style={{ left, top, width, height }}
                    onPointerDown={(event) => handleRectPointerDown(event, rect)}
                  >
                    <span className="redact-rect__label">Redacted</span>
                    <button
                      type="button"
                      className="redact-rect__remove"
                      aria-label="Remove redaction"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteRect(rect.id)
                      }}
                    >
                      <Icon name="close" size="xs" aria-hidden="true" />
                    </button>
                    {selected ? (
                      <>
                        {RESIZE_HANDLES.map((handle) => (
                          <span
                            key={handle}
                            className={`redact-rect__handle redact-rect__handle--${handle}`}
                            onPointerDown={(event) =>
                              handleHandlePointerDown(event, rect, handle)
                            }
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                )
              })}
            </PdfStage>
          ) : (
            <div className="organize-loading" role="status">
              <Spinner size="sm" label="" /> Preparing page…
            </div>
          )}
        </div>

        {workError ? (
          <div className="organize-error" role="alert">
            <Icon name="alert-circle" size="sm" aria-hidden="true" />
            {workError}
          </div>
        ) : null}

        <div className="organize-actions">
          <label className="redact-metadata">
            <input
              type="checkbox"
              checked={removeMetadata}
              onChange={(event) => setRemoveMetadata(event.target.checked)}
            />
            Also remove document metadata (title, author, …)
          </label>
          <Button
            size="lg"
            disabled={committedCount === 0 || processing}
            onClick={() => void handleApply()}
          >
            {processing ? <Spinner size="sm" label="Redacting" /> : null}
            {processing ? 'Redacting…' : 'Apply redactions'}
          </Button>
          {selectedId ? (
            <Button
              type="button"
              variant="ghost"
              disabled={processing}
              onClick={cancelSelection}
              aria-label="Cancel selection"
            >
              Cancel
            </Button>
          ) : null}
          {committedCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={processing}
              onClick={() => {
                cancelSelection()
                setRedactions([])
              }}
            >
              Clear all marks
            </Button>
          ) : null}
          <span className="organize-hint">
            {committedCount} area{committedCount === 1 ? '' : 's'} marked
            {selectedId ? ' — drag to move, grab a handle to resize, Esc to cancel' : ''}
          </span>
        </div>
      </section>
    </div>
  )
}