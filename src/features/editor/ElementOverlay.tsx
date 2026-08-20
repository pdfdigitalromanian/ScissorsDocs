/**
 * ElementOverlay — the interactive editing layer over one rendered PDF page.
 *
 * Elements live in PDF-point space (top-left origin, unrotated). The overlay
 * renders them as positioned boxes at `scale` CSS px per point and turns
 * pointer gestures into element mutations that are committed once per
 * gesture, so every drag becomes a single undo step.
 */
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { ShapeKind } from './elements'
import {
  createImageElement,
  createShapeElement,
  createTextElement,
  elementsForPage,
  hitTestElements,
  inverseRotatePoint,
  nextZIndex,
  normalizeRotation,
} from './elements'
import type {
  PdfElement,
  Point,
  Rect,
  ShapeElement,
  TextElement,
} from './elements'
import { usePdfEditor } from './PdfEditorProvider'
import { useSettings } from '@/features/settings/SettingsProvider'
import { pdfToScreenPoint, screenToPdfPoint } from './coordinates'
import { imageToElementDataUrl } from './engine'
import './editor.css'

const MIN_SIZE = 8
const DRAG_THRESHOLD = 4

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const RESIZE_HANDLES: ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]

type Draft =
  | {
      kind: 'create'
      tool: 'text' | ShapeKind
      start: Point
      current: Point
    }
  | {
      kind: 'move'
      ids: string[]
      startRects: Record<string, Rect>
      startPointer: Point
      current: Point
    }
  | {
      kind: 'resize'
      id: string
      handle: ResizeHandle
      startRect: Rect
      rotation: number
      currentRect: Rect
      /** Image elements lock aspect ratio by default; Shift inverts it. */
      defaultLockAspect: boolean
    }
  | {
      kind: 'rotate'
      id: string
      center: Point
      startPointer: Point
      prevPointer: Point
      rotation: number
    }

interface ElementOverlayProps {
  /** 0-based page index. */
  page: number
  /** Page size in PDF points. */
  width: number
  height: number
  /** Rendered scale: CSS px per PDF point. */
  scale: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function rectOf(element: PdfElement): Rect {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be decoded.'))
    image.src = url
  })
}

function applyTextDefaults(
  element: TextElement,
  defaults: {
    fontFamily: TextElement['fontFamily']
    fontSize: number
    color: string
    bold: boolean
    italic: boolean
    alignment: TextElement['alignment']
  },
): void {
  element.fontFamily = defaults.fontFamily
  element.fontSize = defaults.fontSize
  element.color = defaults.color
  element.bold = defaults.bold
  element.italic = defaults.italic
  element.alignment = defaults.alignment
}

function applyShapeDefaults(
  element: ShapeElement,
  defaults: {
    strokeColor: string
    fillColor: string
    strokeWidth: number
  },
): void {
  element.strokeColor = defaults.strokeColor
  element.strokeWidth = defaults.strokeWidth
  if (element.shape === 'rect' || element.shape === 'ellipse') {
    element.fillColor = defaults.fillColor
  }
}

/** Computes the resized rect while keeping the opposite edge/corner fixed. */
function resizeRect(
  startRect: Rect,
  handle: ResizeHandle,
  pointer: Point,
  rotation: number,
  aspectRatio = 0,
  lockAspect = false,
): Rect {
  const anchors: Record<ResizeHandle, Point> = {
    nw: { x: startRect.x + startRect.width, y: startRect.y + startRect.height },
    n: {
      x: startRect.x + startRect.width / 2,
      y: startRect.y + startRect.height,
    },
    ne: { x: startRect.x, y: startRect.y + startRect.height },
    e: { x: startRect.x, y: startRect.y + startRect.height / 2 },
    se: { x: startRect.x, y: startRect.y },
    s: { x: startRect.x + startRect.width / 2, y: startRect.y },
    sw: { x: startRect.x + startRect.width, y: startRect.y },
    w: {
      x: startRect.x + startRect.width,
      y: startRect.y + startRect.height / 2,
    },
  }
  const anchor = anchors[handle]
  const local = inverseRotatePoint(pointer, anchor, rotation)
  const dx = local.x - anchor.x
  const dy = local.y - anchor.y

  const corner =
    handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se'
  const east = handle === 'e' || handle === 'w'
  const south = handle === 's' || handle === 'n'

  let width = startRect.width
  let height = startRect.height
  if (corner) {
    width = Math.abs(handle === 'ne' || handle === 'se' ? dx : -dx)
    height = Math.abs(handle === 'se' || handle === 'sw' ? dy : -dy)
  } else if (east) {
    width = Math.abs(handle === 'e' ? dx : -dx)
  } else if (south) {
    height = Math.abs(handle === 's' ? dy : -dy)
  }

  width = Math.max(width, MIN_SIZE)
  height = Math.max(height, MIN_SIZE)

  if (lockAspect && aspectRatio > 0) {
    if (corner) {
      const scaleX = startRect.width > 0 ? Math.abs(dx / startRect.width) : 0
      const scaleY = startRect.height > 0 ? Math.abs(dy / startRect.height) : 0
      const scale = Math.max(scaleX, scaleY)
      width = Math.max(startRect.width * scale, MIN_SIZE)
      height = Math.max(startRect.height * scale, MIN_SIZE)
    } else if (east) {
      height = Math.max(width / aspectRatio, MIN_SIZE)
    } else {
      width = Math.max(height * aspectRatio, MIN_SIZE)
    }
  }

  switch (handle) {
    case 'se':
      return { x: anchor.x, y: anchor.y, width, height }
    case 'nw':
      return { x: anchor.x - width, y: anchor.y - height, width, height }
    case 'ne':
      return { x: anchor.x, y: anchor.y - height, width, height }
    case 'sw':
      return { x: anchor.x - width, y: anchor.y, width, height }
    case 'e':
      return { x: anchor.x, y: anchor.y - height / 2, width, height }
    case 'w':
      return { x: anchor.x - width, y: anchor.y - height / 2, width, height }
    case 's':
      return { x: anchor.x - width / 2, y: anchor.y, width, height }
    case 'n':
      return { x: anchor.x - width / 2, y: anchor.y - height, width, height }
    default:
      return startRect
  }
}

/**
 * ElementOverlay renders one page's editable elements and captures pointer
 * gestures: select/move, resize, rotate, create (text + shapes) and inline
 * text editing. Images are added through a hidden file input.
 */
export function ElementOverlay({
  page,
  width,
  height,
  scale,
}: ElementOverlayProps) {
  const {
    elements,
    tool,
    selectedElementIds,
    selectElement,
    toggleElement,
    clearElementSelection,
    addElement,
    updateElement,
    deleteElements,
    commitElements,
    signMode,
    signaturePlaceMode,
    placeSignature,
  } = usePdfEditor()
  const { settings } = useSettings()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [imagePending, setImagePending] = useState<Point | null>(null)

  const pageElements = elementsForPage(elements, page)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingId) {
        if (event.key === 'Escape') {
          setEditingId(null)
          clearElementSelection()
        }
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const pageSelection = selectedElementIds.filter((id) =>
        pageElements.some((element) => element.id === id),
      )
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        pageSelection.length > 0
      ) {
        event.preventDefault()
        void deleteElements(pageSelection)
      } else if (event.key === 'Escape') {
        clearElementSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    editingId,
    selectedElementIds,
    pageElements,
    deleteElements,
    clearElementSelection,
  ])

  function localPoint(event: PointerEvent<Element>): Point {
    const surface = surfaceRef.current
    if (!surface) return { x: 0, y: 0 }
    const rect = surface.getBoundingClientRect()
    return screenToPdfPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      scale,
    )
  }

  function clampToPage(point: Point): Point {
    return {
      x: clamp(point.x, 0, width),
      y: clamp(point.y, 0, height),
    }
  }

  function startCreate(
    event: PointerEvent<HTMLDivElement>,
    toolKind: 'text' | ShapeKind,
  ) {
    const point = clampToPage(localPoint(event))
    setDraft({ kind: 'create', tool: toolKind, start: point, current: point })
    surfaceRef.current?.setPointerCapture(event.pointerId)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (editingId) {
      /* Commit the pending edit by blurring the editor instead of
         unmounting it, so typed text is never lost. */
      textareaRef.current?.blur()
      return
    }
    if (tool === 'image') {
      const point = localPoint(event)
      setImagePending(point)
      fileInputRef.current?.click()
      return
    }

    const point = localPoint(event)
    const hit = hitTestElements(pageElements, point)

    if (signMode && signaturePlaceMode === 'draw') {
      /* In Sign mode the active signature is dropped where the user clicks
         empty page space; clicks on existing placements fall through so the
         signature stays movable. */
      if (!hit) {
        void placeSignature(page, clampToPage(point))
        return
      }
    }

    if (tool === 'select') {
      if (!hit) {
        clearElementSelection()
        return
      }
      if (event.shiftKey) {
        toggleElement(hit.id)
      } else if (!selectedElementIds.includes(hit.id)) {
        selectElement(hit.id)
      }
      const ids =
        selectedElementIds.includes(hit.id) && selectedElementIds.length > 0
          ? selectedElementIds.filter((id) =>
              pageElements.some((element) => element.id === id),
            )
          : [hit.id]
      const startRects: Record<string, Rect> = {}
      for (const id of ids) {
        const element = pageElements.find((entry) => entry.id === id)
        if (element) startRects[id] = rectOf(element)
      }
      if (Object.keys(startRects).length === 0) return
      setDraft({
        kind: 'move',
        ids,
        startRects,
        startPointer: point,
        current: point,
      })
      return
    }

    if (tool === 'text') {
      if (hit && hit.type === 'text') {
        selectElement(hit.id)
        setEditingId(hit.id)
        return
      }
      startCreate(event, 'text')
      return
    }

    if (
      tool === 'rect' ||
      tool === 'ellipse' ||
      tool === 'line' ||
      tool === 'arrow'
    ) {
      startCreate(event, tool)
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draft) return
    /* Capture lazily on the first actual movement instead of at pointerdown.
       Pointer capture retargets the whole gesture (including the click and
       double-click) to the surface, which would swallow the element's
       onDoubleClick used to open the text editor. A stationary click never
       moves, so it never captures and dblclick still reaches the element. */
    const surface = surfaceRef.current
    if (surface && !surface.hasPointerCapture(event.pointerId)) {
      surface.setPointerCapture(event.pointerId)
    }
    const point = clampToPage(localPoint(event))
    switch (draft.kind) {
      case 'create':
        setDraft({ ...draft, current: point })
        break
      case 'move':
        setDraft({ ...draft, current: point })
        break
      case 'resize': {
        const lockAspect = draft.defaultLockAspect !== event.shiftKey
        setDraft({
          ...draft,
          currentRect: resizeRect(
            draft.startRect,
            draft.handle,
            point,
            draft.rotation,
            draft.startRect.width / Math.max(draft.startRect.height, 1),
            lockAspect,
          ),
        })
        break
      }
      case 'rotate': {
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
        break
      }
    }
  }

  function commitCreate() {
    if (!draft || draft.kind !== 'create') return
    const start = draft.start
    const current = draft.current
    const dx = current.x - start.x
    const dy = current.y - start.y
    const isLine = draft.tool === 'line' || draft.tool === 'arrow'
    const zIndex = nextZIndex(elements)

    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      if (draft.tool === 'text') {
        const element = createTextElement(
          page,
          start.x,
          start.y,
          160,
          48,
          zIndex,
        )
        applyTextDefaults(element, settings.editor.text)
        void addElement(element, true)
        setEditingId(element.id)
      } else if (isLine) {
        const element = createShapeElement(
          draft.tool,
          page,
          start.x,
          start.y,
          80,
          60,
          zIndex,
        )
        applyShapeDefaults(element, settings.editor.shape)
        void addElement(element)
      } else {
        const element = createShapeElement(
          draft.tool,
          page,
          start.x,
          start.y,
          120,
          90,
          zIndex,
        )
        applyShapeDefaults(element, settings.editor.shape)
        void addElement(element)
      }
      return
    }

    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const boxWidth = Math.max(Math.abs(dx), MIN_SIZE)
    const boxHeight = Math.max(Math.abs(dy), MIN_SIZE)

    if (draft.tool === 'text') {
      const element = createTextElement(page, x, y, boxWidth, boxHeight, zIndex)
      applyTextDefaults(element, settings.editor.text)
      void addElement(element, true)
      setEditingId(element.id)
    } else {
      const element = createShapeElement(
        draft.tool,
        page,
        x,
        y,
        boxWidth,
        boxHeight,
        zIndex,
      )
      applyShapeDefaults(element, settings.editor.shape)
      if (isLine) {
        element.line = {
          x1: dx < 0 ? boxWidth : 0,
          y1: dy < 0 ? boxHeight : 0,
          x2: dx < 0 ? 0 : boxWidth,
          y2: dy < 0 ? 0 : boxHeight,
        }
      }
      void addElement(element)
    }
  }

  function commitMove(currentPoint: Point) {
    if (!draft || draft.kind !== 'move') return
    const dx = currentPoint.x - draft.startPointer.x
    const dy = currentPoint.y - draft.startPointer.y
    if (dx === 0 && dy === 0) return
    void commitElements((all) =>
      all.map((element) => {
        if (!draft.ids.includes(element.id)) return element
        const startRect = draft.startRects[element.id]
        if (!startRect) return element
        const rotation = normalizeRotation(element.rotation)
        if (rotation !== 0 && rotation !== 180) {
          return {
            ...element,
            x: startRect.x + dx,
            y: startRect.y + dy,
          }
        }
        const maxX = Math.max(0, width - startRect.width)
        const maxY = Math.max(0, height - startRect.height)
        return {
          ...element,
          x: clamp(startRect.x + dx, 0, maxX),
          y: clamp(startRect.y + dy, 0, maxY),
        }
      }),
    )
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!draft) return
    const finalPoint = clampToPage(localPoint(event))
    switch (draft.kind) {
      case 'create':
        commitCreate()
        break
      case 'move':
        commitMove(finalPoint)
        break
      case 'resize': {
        const lockAspect = draft.defaultLockAspect !== event.shiftKey
        const rect = resizeRect(
          draft.startRect,
          draft.handle,
          finalPoint,
          draft.rotation,
          draft.startRect.width / Math.max(draft.startRect.height, 1),
          lockAspect,
        )
        void updateElement(draft.id, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        break
      }
      case 'rotate': {
        const angleToPrevious =
          Math.atan2(
            draft.prevPointer.y - draft.center.y,
            draft.prevPointer.x - draft.center.x,
          ) *
          (180 / Math.PI)
        const angleToCurrent =
          Math.atan2(
            finalPoint.y - draft.center.y,
            finalPoint.x - draft.center.x,
          ) *
          (180 / Math.PI)
        void updateElement(draft.id, {
          rotation: normalizeRotation(
            draft.rotation + angleToCurrent - angleToPrevious,
          ),
        })
        break
      }
    }
    setDraft(null)
  }

  function commitTextEdit(id: string, content: string) {
    const element = pageElements.find((entry) => entry.id === id)
    if (element && element.type === 'text' && element.content !== content) {
      void updateElement(id, { content }, true)
    }
    setEditingId((current) => (current === id ? null : current))
  }

  async function handleImageFile(file: File) {
    const point = imagePending
    setImagePending(null)
    if (!point) return
    try {
      const dataUrl = await imageToElementDataUrl(file)
      const image = await loadImageElement(dataUrl)
      if (!image.naturalWidth || !image.naturalHeight) return
      const targetWidth = Math.min(image.naturalWidth, 240)
      const targetHeight =
        image.naturalHeight * (targetWidth / image.naturalWidth)
      const element = createImageElement(
        page,
        point.x,
        point.y,
        targetWidth,
        targetHeight,
        nextZIndex(elements),
        dataUrl,
        file.name,
      )
      void addElement(element)
    } catch {
      // The file could not be rasterized — silently ignore the insertion.
    }
  }

  function elementDisplay(element: PdfElement): {
    rect: Rect
    rotation: number
  } {
    if (!draft) return { rect: rectOf(element), rotation: element.rotation }
    if (draft.kind === 'move' && draft.ids.includes(element.id)) {
      const startRect = draft.startRects[element.id]
      if (!startRect)
        return { rect: rectOf(element), rotation: element.rotation }
      const dx = draft.current.x - draft.startPointer.x
      const dy = draft.current.y - draft.startPointer.y
      return {
        rect: {
          x: startRect.x + dx,
          y: startRect.y + dy,
          width: startRect.width,
          height: startRect.height,
        },
        rotation: element.rotation,
      }
    }
    if (draft.kind === 'resize' && draft.id === element.id) {
      return { rect: draft.currentRect, rotation: element.rotation }
    }
    if (draft.kind === 'rotate' && draft.id === element.id) {
      return { rect: rectOf(element), rotation: draft.rotation }
    }
    return { rect: rectOf(element), rotation: element.rotation }
  }

  function startResize(
    event: PointerEvent<HTMLSpanElement>,
    element: PdfElement,
    handle: ResizeHandle,
  ) {
    event.stopPropagation()
    setDraft({
      kind: 'resize',
      id: element.id,
      handle,
      startRect: rectOf(element),
      rotation: element.rotation,
      currentRect: rectOf(element),
      defaultLockAspect: element.type === 'image' && element.lockAspect !== false,
    })
    surfaceRef.current?.setPointerCapture(event.pointerId)
  }

  function startRotate(
    event: PointerEvent<HTMLSpanElement>,
    element: PdfElement,
  ) {
    event.stopPropagation()
    const point = localPoint(event)
    const center = {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    }
    setDraft({
      kind: 'rotate',
      id: element.id,
      center,
      startPointer: point,
      prevPointer: point,
      rotation: element.rotation,
    })
    surfaceRef.current?.setPointerCapture(event.pointerId)
  }

  function draftRect(): Rect | null {
    if (!draft || draft.kind !== 'create') return null
    const dx = draft.current.x - draft.start.x
    const dy = draft.current.y - draft.start.y
    return {
      x: Math.min(draft.start.x, draft.current.x),
      y: Math.min(draft.start.y, draft.current.y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    }
  }

  const isSelected = (id: string) => selectedElementIds.includes(id)
  const editingElement =
    editingId !== null
      ? (pageElements.find((element) => element.id === editingId) as
          TextElement | undefined)
      : undefined
  const createRect = draftRect()
  const draftLine =
    draft?.kind === 'create' &&
    (draft.tool === 'line' || draft.tool === 'arrow')
      ? draft
      : null

  return (
    <div
      ref={surfaceRef}
      className={`editor-overlay${tool === 'select' ? ' editor-overlay--select' : ''}${
        signMode && signaturePlaceMode === 'draw'
          ? ' editor-overlay--sign'
          : ''
      }`}
      style={{ width: width * scale, height: height * scale }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDraft(null)}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/avif"
        className="editor-overlay__file-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleImageFile(file)
          event.target.value = ''
        }}
      />

      {pageElements.map((element) => {
        const display = elementDisplay(element)
        const screen = pdfToScreenPoint(display.rect.x, display.rect.y, scale)
        const selected = isSelected(element.id)
        const editing = editingId === element.id
        return (
          <div
            key={element.id}
            className={`editor-element${selected ? ' editor-element--selected' : ''}`}
            data-element-type={element.type}
            style={{
              left: screen.x,
              top: screen.y,
              width: display.rect.width * scale,
              height: display.rect.height * scale,
              transform: display.rotation
                ? `rotate(${display.rotation}deg)`
                : undefined,
              zIndex: element.zIndex,
              opacity: element.opacity ?? 1,
            }}
            onPointerDown={(event) => {
              if (editingId && editingId !== element.id) {
                textareaRef.current?.blur()
              }
              if (tool !== 'select' || editing) return
              event.stopPropagation()
              if (event.shiftKey) {
                toggleElement(element.id)
                return
              }
              selectElement(element.id)
              const ids =
                selectedElementIds.includes(element.id) &&
                selectedElementIds.length > 0
                  ? selectedElementIds.filter((id) =>
                      pageElements.some((entry) => entry.id === id),
                    )
                  : [element.id]
              const startRects: Record<string, Rect> = {}
              for (const id of ids) {
                const entry = pageElements.find((target) => target.id === id)
                if (entry) startRects[id] = rectOf(entry)
              }
              const point = localPoint(event)
              setDraft({
                kind: 'move',
                ids,
                startRects,
                startPointer: point,
                current: point,
              })
            }}
            onDoubleClick={(event) => {
              if (tool !== 'select' || element.type !== 'text') return
              event.stopPropagation()
              /* Cancel the move draft the click sequence started so the
                 editor never drags the element while typing. */
              setDraft(null)
              selectElement(element.id)
              setEditingId(element.id)
            }}
          >
            {!editing && <ElementPreview element={element} scale={scale} />}
            {selected && !editing ? (
              <>
                <div className="editor-element__frame" aria-hidden="true" />
                {RESIZE_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={`editor-element__handle editor-element__handle--${handle}`}
                    aria-hidden="true"
                    onPointerDown={(event) =>
                      startResize(event, element, handle)
                    }
                  />
                ))}
                <span
                  className="editor-element__rotate-handle"
                  title="Rotate"
                  aria-hidden="true"
                  onPointerDown={(event) => startRotate(event, element)}
                />
              </>
            ) : null}
          </div>
        )
      })}

      {createRect && !draftLine && (
        <div
          className="editor-overlay__draft editor-overlay__draft--box"
          style={{
            left: createRect.x * scale,
            top: createRect.y * scale,
            width: createRect.width * scale,
            height: createRect.height * scale,
          }}
        />
      )}

      {draftLine && (
        <svg
          className="editor-overlay__draft editor-overlay__draft--line"
          width={width * scale}
          height={height * scale}
        >
          <line
            x1={draftLine.start.x * scale}
            y1={draftLine.start.y * scale}
            x2={draftLine.current.x * scale}
            y2={draftLine.current.y * scale}
          />
        </svg>
      )}

      {editingElement && (
        <textarea
          key={editingElement.id}
          ref={textareaRef}
          className="editor-element__input"
          style={{
            left: editingElement.x * scale,
            top: editingElement.y * scale,
            width: editingElement.width * scale,
            height: editingElement.height * scale,
            fontSize: Math.max(8, editingElement.fontSize * scale),
            color: editingElement.color,
            fontFamily: editingElement.fontFamily,
            fontWeight: editingElement.bold ? 600 : 400,
            fontStyle: editingElement.italic ? 'italic' : 'normal',
            textAlign: editingElement.alignment,
            lineHeight: editingElement.lineHeight ?? 1.25,
            opacity: editingElement.opacity ?? 1,
            transform: editingElement.rotation
              ? `rotate(${editingElement.rotation}deg)`
              : undefined,
          }}
          defaultValue={editingElement.content}
          autoFocus
          onFocus={(event) => event.target.select()}
          onBlur={(event) =>
            commitTextEdit(editingElement.id, event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur()
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  )
}

function ElementPreview({
  element,
  scale,
}: {
  element: PdfElement
  scale: number
}) {
  if (element.type === 'text') {
    return (
      <div
        className="editor-element__text"
        style={{
          fontSize: Math.max(1, element.fontSize * scale),
          color: element.color,
          fontFamily: element.fontFamily,
          fontWeight: element.bold ? 600 : 400,
          fontStyle: element.italic ? 'italic' : 'normal',
          textAlign: element.alignment,
          lineHeight: element.lineHeight ?? 1.25,
        }}
      >
        {element.content}
      </div>
    )
  }
  if (element.type === 'image') {
    return (
      <img
        className="editor-element__image"
        src={element.source}
        alt={element.name}
      />
    )
  }
  return <ShapePreview element={element} scale={scale} />
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
        className="editor-element__shape"
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
        className="editor-element__shape"
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
      className="editor-element__shape"
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
      {element.shape === 'arrow' && (
        <ArrowHead line={line} strokeWidth={element.strokeWidth} />
      )}
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
