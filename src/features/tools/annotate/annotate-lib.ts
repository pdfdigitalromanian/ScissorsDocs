/**
 * Shared engine for the standalone Shapes and Images tools.
 *
 * These tools reuse the Workspace editor's element model verbatim: shapes and
 * images are `PdfElement` records stored in PDF points with a top-left origin
 * (unrotated content space), so the overlay only ever renders that model and
 * the exported PDF is produced by the exact same pdf-lib code path the
 * Workspace editor uses (`drawElements`). The result is that what you draw in
 * the tool is pixel-for-pixel what lands in the PDF.
 */
import type { Point, Rect, ShapeElement, PdfElement, ShapeKind } from '@/features/editor/elements'
import {
  createShapeElement,
  createImageElement,
  inverseRotatePoint,
  normalizeRotation,
  nextZIndex,
} from '@/features/editor/elements'
import { screenToPdfPoint } from '@/features/editor/coordinates'
import { imageToElementDataUrl } from '@/features/editor/engine'
import { PDFDocument } from 'pdf-lib'
import {
  drawElements,
  stripElementStreams,
  writeElementsToDoc,
} from '@/features/editor/element-pdf'

export type {
  Point,
  Rect,
  PdfElement,
  ShapeElement,
  ShapeKind,
}

export type AnnotateHandle =
  | 'tl'
  | 't'
  | 'tr'
  | 'r'
  | 'br'
  | 'b'
  | 'bl'
  | 'l'

export const ANNOTATE_HANDLES: AnnotateHandle[] = [
  'tl',
  't',
  'tr',
  'r',
  'br',
  'b',
  'bl',
  'l',
]

export const ANNOTATE_MIN_SIZE = 8

export type AnnotateTool = 'select' | 'image' | ShapeKind

/** Converts an overlay CSS-space point into element PDF points. */
export function cssToPdfPoint(css: Point, scale: number): Point {
  return screenToPdfPoint(css.x, css.y, scale)
}

export function elementRect(element: PdfElement): Rect {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }
}

/**
 * Anchor-based resize keeping the opposite edge/corner fixed. Works in the
 * element's local (inverse-rotated) space and enforces a minimum size, so
 * dragging never collapses a shape. `aspectRatio = width / height`; images
 * stay proportional unless the user holds Shift.
 */
export function resizeElement(
  startRect: Rect,
  handle: AnnotateHandle,
  pointer: Point,
  rotation: number,
  aspectRatio = 0,
  lockAspect = false,
): Rect {
  const anchors: Record<AnnotateHandle, Point> = {
    tl: { x: startRect.x + startRect.width, y: startRect.y + startRect.height },
    t: {
      x: startRect.x + startRect.width / 2,
      y: startRect.y + startRect.height,
    },
    tr: { x: startRect.x, y: startRect.y + startRect.height },
    r: { x: startRect.x, y: startRect.y + startRect.height / 2 },
    br: { x: startRect.x, y: startRect.y },
    b: { x: startRect.x + startRect.width / 2, y: startRect.y },
    bl: { x: startRect.x + startRect.width, y: startRect.y },
    l: {
      x: startRect.x + startRect.width,
      y: startRect.y + startRect.height / 2,
    },
  }
  const anchor = anchors[handle]
  const local = inverseRotatePoint(pointer, anchor, rotation)
  const dx = local.x - anchor.x
  const dy = local.y - anchor.y

  const corner =
    handle === 'tl' || handle === 'tr' || handle === 'bl' || handle === 'br'
  const horizontal = handle === 'l' || handle === 'r'
  const vertical = handle === 't' || handle === 'b'

  let width = startRect.width
  let height = startRect.height
  if (corner) {
    width = Math.abs(handle === 'tr' || handle === 'br' ? dx : -dx)
    height = Math.abs(handle === 'br' || handle === 'bl' ? dy : -dy)
  } else if (horizontal) {
    width = Math.abs(handle === 'r' ? dx : -dx)
  } else if (vertical) {
    height = Math.abs(handle === 'b' ? dy : -dy)
  }

  width = Math.max(width, ANNOTATE_MIN_SIZE)
  height = Math.max(height, ANNOTATE_MIN_SIZE)

  if (lockAspect && aspectRatio > 0) {
    if (corner) {
      const scaleX = startRect.width > 0 ? Math.abs(dx / startRect.width) : 0
      const scaleY = startRect.height > 0 ? Math.abs(dy / startRect.height) : 0
      const scale = Math.max(scaleX, scaleY)
      width = Math.max(startRect.width * scale, ANNOTATE_MIN_SIZE)
      height = Math.max(startRect.height * scale, ANNOTATE_MIN_SIZE)
    } else if (horizontal) {
      height = Math.max(width / aspectRatio, ANNOTATE_MIN_SIZE)
    } else {
      width = Math.max(height * aspectRatio, ANNOTATE_MIN_SIZE)
    }
  }

  switch (handle) {
    case 'br':
      return { x: anchor.x, y: anchor.y, width, height }
    case 'tl':
      return { x: anchor.x - width, y: anchor.y - height, width, height }
    case 'tr':
      return { x: anchor.x, y: anchor.y - height, width, height }
    case 'bl':
      return { x: anchor.x - width, y: anchor.y, width, height }
    case 'r':
      return { x: anchor.x, y: anchor.y - height / 2, width, height }
    case 'l':
      return { x: anchor.x - width, y: anchor.y - height / 2, width, height }
    case 'b':
      return { x: anchor.x - width / 2, y: anchor.y, width, height }
    case 't':
      return { x: anchor.x - width / 2, y: anchor.y - height, width, height }
    default:
      return startRect
  }
}

export interface ShapeDefaults {
  strokeColor: string
  fillColor: string | null
  strokeWidth: number
  cornerRadius: number
}

/** Builds a new shape element from a drag and the active style defaults. */
export function commitShape(
  pageIndex: number,
  elements: readonly PdfElement[],
  shape: ShapeKind,
  start: Point,
  current: Point,
  defaults: ShapeDefaults,
): ShapeElement {
  const zIndex = nextZIndex(elements)
  const dx = current.x - start.x
  const dy = current.y - start.y
  const isLine = shape === 'line' || shape === 'arrow'
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  const width = Math.max(Math.abs(dx), ANNOTATE_MIN_SIZE)
  const height = Math.max(Math.abs(dy), ANNOTATE_MIN_SIZE)
  const element = createShapeElement(shape, pageIndex, x, y, width, height, zIndex)
  element.strokeColor = defaults.strokeColor
  element.strokeWidth = defaults.strokeWidth
  if (shape === 'rect') element.cornerRadius = defaults.cornerRadius
  if (shape === 'rect' || shape === 'ellipse') {
    element.fillColor = defaults.fillColor
  } else {
    element.fillColor = null
  }
  if (isLine) {
    element.line = {
      x1: dx < 0 ? width : 0,
      y1: dy < 0 ? height : 0,
      x2: dx < 0 ? 0 : width,
      y2: dy < 0 ? 0 : height,
    }
  }
  return element
}

/** Loads an image file and turns it into an element model entry. */
export async function commitImage(
  pageIndex: number,
  elements: readonly PdfElement[],
  point: Point,
  file: File,
): Promise<PdfElement | null> {
  try {
    const source = await imageToElementDataUrl(file)
    const image = await loadImageElement(source)
    if (!image.naturalWidth || !image.naturalHeight) return null
    const targetWidth = Math.min(image.naturalWidth, 240)
    const targetHeight = image.naturalHeight * (targetWidth / image.naturalWidth)
    return createImageElement(
      pageIndex,
      point.x - targetWidth / 2,
      point.y - targetHeight / 2,
      targetWidth,
      targetHeight,
      nextZIndex(elements),
      source,
      file.name,
    )
  } catch {
    return null
  }
}

export function loadImageElement(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded.'))
    image.src = source
  })
}

export function duplicateElement(element: PdfElement): PdfElement {
  return {
    ...element,
    id: createStandaloneId(element.type),
    x: element.x + 16,
    y: element.y + 16,
  }
}

let standaloneSeq = 0
function createStandaloneId(type: PdfElement['type']): string {
  standaloneSeq += 1
  return `an-${type}-${Date.now().toString(36)}-${standaloneSeq.toString(36)}`
}

/**
 * Produces the finished PDF: strips any previously-baked element streams,
 * redraws the current elements through the shared editor exporter, persists
 * the element model so the result can keep being edited in the Workspace,
 * then verifies the output page count.
 */
export async function exportElementsPdf(
  sourceBytes: Uint8Array,
  elements: readonly PdfElement[],
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(sourceBytes)
  const originalPages = doc.getPageCount()
  stripElementStreams(doc)
  await drawElements(doc, elements)
  writeElementsToDoc(doc, elements)
  const bytes = await doc.save({ useObjectStreams: true })
  const reopened = await PDFDocument.load(bytes)
  if (reopened.getPageCount() !== originalPages) {
    throw new Error('The PDF lost content while it was being generated.')
  }
  return { bytes, pageCount: reopened.getPageCount() }
}

export { normalizeRotation }