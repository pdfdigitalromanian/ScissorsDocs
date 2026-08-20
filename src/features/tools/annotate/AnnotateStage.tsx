import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type {
  PdfElement,
  Point,
  Rect,
  ShapeElement,
  ShapeKind,
} from '@/features/editor/elements'
import { normalizeRotation, hitTestElements, elementCenter } from '@/features/editor/elements'
import PdfStage from '../stage/PdfStage'
import {
  ANNOTATE_HANDLES,
  cssToPdfPoint,
  elementRect,
  resizeElement,
  type AnnotateHandle,
  type AnnotateTool,
} from './annotate-lib'

interface AnnotateStageProps {
  page: PDFPageProxy | null
  scale: number
  pageIndex: number
  /** Page size in PDF points (viewport / scale). */
  pageSize: { width: number; height: number }
  elements: PdfElement[]
  selectedId: string | null
  tool: AnnotateTool
  onSelect: (id: string | null) => void
  onUpdateElement: (id: string, updates: Partial<PdfElement>) => void
  onDeleteElement: (id: string) => void
  onCommitCreate: (shape: ShapeKind, start: Point, current: Point) => void
  onImageFile: (point: Point, file: File) => void
}

type Draft =
  | { kind: 'create'; tool: ShapeKind; start: Point; current: Point }
  | { kind: 'move'; id: string; startPointer: Point; current: Point; startRect: Rect }
  | {
      kind: 'resize'
      id: string
      handle: AnnotateHandle
      startRect: Rect
      rotation: number
      currentRect: Rect
      aspectRatio: number
      lockAspect: boolean
    }
  | { kind: 'rotate'; id: string; center: Point; prevPointer: Point; rotation: number }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * AnnotateStage renders one PDF page through PdfStage and hosts the shared
 * element overlay: hit-test selection, move/resize/rotate with handles, and
 * drag-to-create previews for shapes. It is the same interaction model the
 * Workspace editor uses, minus the text tool.
 */
export function AnnotateStage({
  page,
  scale,
  pageIndex,
  pageSize,
  elements,
  selectedId,
  tool,
  onSelect,
  onUpdateElement,
  onDeleteElement,
  onCommitCreate,
  onImageFile,
}: AnnotateStageProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [imagePending, setImagePending] = useState<Point | null>(null)

  const pageElements = elements.filter((element) => element.page === pageIndex)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setDraft(null)
        onSelect(null)
        return
      }
      if (selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        onDeleteElement(selectedId)
        onSelect(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, onSelect, onDeleteElement])

  useEffect(() => {
    if (pageIndex !== undefined) setDraft(null)
  }, [pageIndex])

  function localPoint(event: { clientX: number; clientY: number }): Point {
    const surface = surfaceRef.current
    const rect = surface?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  function clampToPage(point: Point): Point {
    return {
      x: clamp(point.x, 0, pageSize.width * scale),
      y: clamp(point.y, 0, pageSize.height * scale),
    }
  }

  function handleSurfacePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (event.currentTarget !== event.target) return
    if (!page) return
    const point = cssToPdfPoint(clampToPage(localPoint(event)), scale)

    if (tool === 'image') {
      setImagePending(point)
      fileInputRef.current?.click()
      return
    }

    const hit = hitTestElements(pageElements, point)
    if (tool === 'select') {
      if (!hit) {
        onSelect(null)
        return
      }
      onSelect(hit.id)
      const startRect = elementRect(hit)
      setDraft({
        kind: 'move',
        id: hit.id,
        startPointer: point,
        current: point,
        startRect,
      })
      return
    }

    if (
      tool === 'rect' ||
      tool === 'ellipse' ||
      tool === 'line' ||
      tool === 'arrow'
    ) {
      onSelect(null)
      setDraft({ kind: 'create', tool, start: point, current: point })
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!draft) return
    const point = cssToPdfPoint(clampToPage(localPoint(event)), scale)
    if (draft.kind === 'create') {
      setDraft({ ...draft, current: point })
    } else if (draft.kind === 'move') {
      setDraft({ ...draft, current: point })
    } else if (draft.kind === 'resize') {
      setDraft({
        ...draft,
        currentRect: resizeElement(
          draft.startRect,
          draft.handle,
          point,
          draft.rotation,
          draft.aspectRatio,
          draft.lockAspect,
        ),
      })
    } else if (draft.kind === 'rotate') {
      const angleToPrevious =
        Math.atan2(
          draft.prevPointer.y - draft.center.y,
          draft.prevPointer.x - draft.center.x,
        ) *
        (180 / Math.PI)
      const angleToCurrent =
        Math.atan2(point.y - draft.center.y, point.x - draft.center.x) *
        (180 / Math.PI)
      setDraft({
        ...draft,
        prevPointer: point,
        rotation: normalizeRotation(
          draft.rotation + angleToCurrent - angleToPrevious,
        ),
      })
    }
  }

  function handlePointerUp() {
    if (!draft) return
    if (draft.kind === 'create') {
      onCommitCreate(draft.tool, draft.start, draft.current)
    } else if (draft.kind === 'move') {
      const dx = draft.current.x - draft.startPointer.x
      const dy = draft.current.y - draft.startPointer.y
      if (dx !== 0 || dy !== 0) {
        onUpdateElement(draft.id, {
          x: draft.startRect.x + dx,
          y: draft.startRect.y + dy,
        })
      }
    } else if (draft.kind === 'resize') {
      onUpdateElement(draft.id, {
        x: draft.currentRect.x,
        y: draft.currentRect.y,
        width: draft.currentRect.width,
        height: draft.currentRect.height,
      })
    } else if (draft.kind === 'rotate') {
      onUpdateElement(draft.id, { rotation: draft.rotation })
    }
    setDraft(null)
  }

  useEffect(() => {
    if (!draft) return
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  function startResize(
    event: ReactPointerEvent<HTMLElement>,
    element: PdfElement,
    handle: AnnotateHandle,
  ) {
    event.stopPropagation()
    const startRect = elementRect(element)
    setDraft({
      kind: 'resize',
      id: element.id,
      handle,
      startRect,
      rotation: element.rotation,
      currentRect: startRect,
      aspectRatio: startRect.width / Math.max(startRect.height, 1),
      lockAspect: element.type === 'image' && element.lockAspect !== false,
    })
  }

  function startRotate(
    event: ReactPointerEvent<HTMLElement>,
    element: PdfElement,
  ) {
    event.stopPropagation()
    setDraft({
      kind: 'rotate',
      id: element.id,
      center: elementCenter(element),
      prevPointer: elementCenter(element),
      rotation: element.rotation,
    })
  }

  function elementDisplay(element: PdfElement): { rect: Rect; rotation: number } {
    if (!draft) return { rect: elementRect(element), rotation: element.rotation }
    if (draft.kind === 'move' && draft.id === element.id) {
      return {
        rect: {
          ...draft.startRect,
          x: draft.startRect.x + (draft.current.x - draft.startPointer.x),
          y: draft.startRect.y + (draft.current.y - draft.startPointer.y),
        },
        rotation: element.rotation,
      }
    }
    if (draft.kind === 'resize' && draft.id === element.id) {
      return { rect: draft.currentRect, rotation: element.rotation }
    }
    if (draft.kind === 'rotate' && draft.id === element.id) {
      return { rect: elementRect(element), rotation: draft.rotation }
    }
    return { rect: elementRect(element), rotation: element.rotation }
  }

  const createDraft = draft?.kind === 'create' ? draft : null

  return (
    <PdfStage page={page} scale={scale}>
      <div
        ref={surfaceRef}
        className="annotate-stage__surface"
        style={{ width: pageSize.width * scale, height: pageSize.height * scale }}
        onPointerDown={handleSurfacePointerDown}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/avif"
          className="annotate-stage__file-input"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file && imagePending) onImageFile(imagePending, file)
            setImagePending(null)
            event.target.value = ''
          }}
        />

        {pageElements.map((element) => {
          const display = elementDisplay(element)
          const selected = selectedId === element.id
          return (
            <div
              key={element.id}
              className={`annotate-element${
                selected ? ' annotate-element--selected' : ''
              }`}
              style={{
                left: display.rect.x * scale,
                top: display.rect.y * scale,
                width: display.rect.width * scale,
                height: display.rect.height * scale,
                transform: display.rotation
                  ? `rotate(${display.rotation}deg)`
                  : undefined,
                zIndex: element.zIndex,
                opacity: element.opacity ?? 1,
              }}
              onPointerDown={(event) => {
                if (tool !== 'select') return
                event.stopPropagation()
                onSelect(element.id)
                const point = cssToPdfPoint(
                  clampToPage(localPoint(event)),
                  scale,
                )
                setDraft({
                  kind: 'move',
                  id: element.id,
                  startPointer: point,
                  current: point,
                  startRect: elementRect(element),
                })
              }}
            >
              {element.type === 'image' ? (
                <img
                  className="annotate-element__image"
                  src={element.source}
                  alt={element.name}
                  draggable={false}
                />
              ) : element.type === 'shape' ? (
                <ShapePreview element={element} scale={scale} />
              ) : null}
              {selected ? (
                <>
                  <div className="annotate-element__frame" aria-hidden="true" />
                  {ANNOTATE_HANDLES.map((handle) => (
                    <span
                      key={handle}
                      className={`annotate-element__handle annotate-element__handle--${handle}`}
                      aria-hidden="true"
                      onPointerDown={(event) =>
                        startResize(event, element, handle)
                      }
                    />
                  ))}
                  <span
                    className="annotate-element__rotate"
                    title="Rotate"
                    aria-hidden="true"
                    onPointerDown={(event) => startRotate(event, element)}
                  />
                </>
              ) : null}
            </div>
          )
        })}

        {createDraft &&
        (createDraft.tool === 'line' || createDraft.tool === 'arrow') ? (
          <svg
            className="annotate-stage__draft annotate-stage__draft--line"
            width={pageSize.width * scale}
            height={pageSize.height * scale}
          >
            <line
              x1={createDraft.start.x * scale}
              y1={createDraft.start.y * scale}
              x2={createDraft.current.x * scale}
              y2={createDraft.current.y * scale}
            />
          </svg>
        ) : null}

        {createDraft &&
        createDraft.tool !== 'line' &&
        createDraft.tool !== 'arrow' ? (
          <div
            className="annotate-stage__draft annotate-stage__draft--box"
            style={{
              left: Math.min(createDraft.start.x, createDraft.current.x) * scale,
              top: Math.min(createDraft.start.y, createDraft.current.y) * scale,
              width: Math.abs(createDraft.current.x - createDraft.start.x) * scale,
              height: Math.abs(createDraft.current.y - createDraft.start.y) * scale,
            }}
          />
        ) : null}

        <div className="annotate-stage__hint">
          {tool === 'select'
            ? 'Select — click an element to move, drag a handle to resize, use the ring to rotate. Delete removes it, Esc deselects.'
            : tool === 'image'
              ? 'Image — click the page to place the image file you pick.'
              : `Drawing ${tool} — drag on the page to draw.`}
        </div>
      </div>
    </PdfStage>
  )
}

function ShapePreview({
  element,
  scale,
}: {
  element: ShapeElement
  scale: number
}) {
  const width = element.width
  const height = element.height
  const hasStroke = element.strokeWidth > 0
  const fill = element.fillColor ?? 'none'

  if (element.shape === 'rect') {
    const inset = Math.min(
      hasStroke ? element.strokeWidth / 2 : 0,
      width / 2,
      height / 2,
    )
    return (
      <svg
        className="annotate-element__shape"
        width={width * scale}
        height={height * scale}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <rect
          x={inset}
          y={inset}
          width={Math.max(0, width - inset * 2)}
          height={Math.max(0, height - inset * 2)}
          rx={element.cornerRadius ?? 0}
          ry={element.cornerRadius ?? 0}
          fill={fill}
          stroke={hasStroke ? element.strokeColor : 'none'}
          strokeWidth={hasStroke ? element.strokeWidth : 0}
        />
      </svg>
    )
  }

  if (element.shape === 'ellipse') {
    const rx = Math.max(0, width / 2 - element.strokeWidth / 2)
    const ry = Math.max(0, height / 2 - element.strokeWidth / 2)
    return (
      <svg
        className="annotate-element__shape"
        width={width * scale}
        height={height * scale}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={rx}
          ry={ry}
          fill={fill}
          stroke={hasStroke ? element.strokeColor : 'none'}
          strokeWidth={hasStroke ? element.strokeWidth : 0}
        />
      </svg>
    )
  }

  const line = element.line ?? { x1: 0, y1: 0, x2: width, y2: height }
  return (
    <svg
      className="annotate-element__shape"
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        stroke={element.strokeColor}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
      />
      {element.shape === 'arrow' ? (
        <ArrowHead line={line} strokeWidth={element.strokeWidth} />
      ) : null}
    </svg>
  )
}

function ArrowHead({
  line,
  strokeWidth,
}: {
  line: { x1: number; y1: number; x2: number; y2: number }
  strokeWidth: number
}) {
  const dx = line.x2 - line.x1
  const dy = line.y2 - line.y1
  const length = Math.hypot(dx, dy)
  if (length <= 0) return null
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const size = Math.max(6, strokeWidth * 3)
  const wing = Math.min(size, length * 0.5)
  const spread = wing * 0.55
  const backX = line.x2 - ux * wing
  const backY = line.y2 - uy * wing
  return (
    <>
      <line
        x1={line.x2}
        y1={line.y2}
        x2={backX + px * spread}
        y2={backY + py * spread}
        stroke={strokeWidth > 0 ? 'currentColor' : 'none'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={line.x2}
        y1={line.y2}
        x2={backX - px * spread}
        y2={backY - py * spread}
        stroke={strokeWidth > 0 ? 'currentColor' : 'none'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </>
  )
}