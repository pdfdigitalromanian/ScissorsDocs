/**
 * Element model for the PDF content editor (Phase 3 — Milestone 3.3).
 *
 * Every editable object — text, image, shape — is an element described by
 * a plain, serializable record in PDF page coordinates (top-left origin,
 * unrotated content space). The rendered overlay is never the source of
 * truth: geometry is stored here and reproduced in the exported PDF.
 */
import type { RotationDirection } from './model'

export type ElementType = 'text' | 'image' | 'shape'
export type TextAlign = 'left' | 'center' | 'right'
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow'

/** Active editing tool. `image` is an action (file picker) in the toolbar. */
export type EditorTool = 'select' | 'text' | 'image' | ShapeKind

export interface PdfElementBase {
  /** Stable id, unique within the session. */
  id: string
  type: ElementType
  /** 0-based page index the element lives on. */
  page: number
  /** Top-left corner in PDF points (unrotated content space). */
  x: number
  y: number
  /** Bounding box size in PDF points. */
  width: number
  height: number
  /** Clockwise degrees as seen on screen. */
  rotation: number
  /** Paint order within a page — ascending, so higher draws on top. */
  zIndex: number
  /** 0–1 opacity. Missing values normalize to 1 on load. */
  opacity?: number
}

export interface TextElement extends PdfElementBase {
  type: 'text'
  content: string
  fontFamily: 'helvetica' | 'times' | 'courier'
  fontSize: number
  bold: boolean
  italic: boolean
  alignment: TextAlign
  /** Hex color, for example `#112233`. */
  color: string
  /** Line-height multiplier applied in the exported PDF. Default 1.25. */
  lineHeight?: number
}

export interface ImageElement extends PdfElementBase {
  type: 'image'
  /** PNG or JPEG data URL (other formats are rasterized on import). */
  source: string
  name: string
  /** Resize keeps the aspect ratio when true (default). */
  lockAspect?: boolean
  /** Marks elements created by the Sign workflow so the inspector can
   * treat them as signatures. */
  kind?: 'signature'
  /** The signature asset (SignatureImage.id) a placement came from, so
   * deleting the asset can also remove every placement that uses it. */
  signatureId?: string
  /** Hex color applied to the signature strokes (persisted for the
   * inspector control). */
  color?: string
  /** Stroke width as a percentage of the original signature (100 = as
   * drawn). Persisted so the inspector can keep showing the live value. */
  strokeWidth?: number
}

/** Local endpoints for line/arrow shapes, in element-local coordinates. */
export interface LinePoints {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ShapeElement extends PdfElementBase {
  type: 'shape'
  shape: ShapeKind
  strokeColor: string
  /** Null means no fill (transparent). */
  fillColor: string | null
  strokeWidth: number
  /** Required for `line` and `arrow` shapes. */
  line?: LinePoints
  /** Rounded corner radius in points for `rect` shapes. Default 0. */
  cornerRadius?: number
}

export type PdfElement = TextElement | ImageElement | ShapeElement

/** Versioned wrapper persisted inside the PDF document metadata. */
export interface ElementModel {
  version: 1
  elements: PdfElement[]
}

export const ELEMENT_MODEL_VERSION = 1

export const FONT_FAMILIES = ['helvetica', 'times', 'courier'] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]

export const TEXT_ALIGNMENTS: TextAlign[] = ['left', 'center', 'right']

export const DEFAULT_TEXT_ELEMENT: Omit<
  TextElement,
  'id' | 'page' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex'
> = {
  type: 'text',
  content: 'Text',
  fontFamily: 'helvetica',
  fontSize: 16,
  bold: false,
  italic: false,
  alignment: 'left',
  color: '#111111',
  lineHeight: 1.25,
}

export const DEFAULT_SHAPE_ELEMENT: Omit<
  ShapeElement,
  'id' | 'page' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex' | 'shape'
> = {
  type: 'shape',
  strokeColor: '#1f6feb',
  fillColor: '#1f6feb',
  strokeWidth: 2,
  cornerRadius: 0,
}

let nextId = 0

export function createElementId(): string {
  nextId += 1
  return `el-${Date.now().toString(36)}-${nextId.toString(36)}`
}

export function nextZIndex(elements: readonly PdfElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.zIndex), 0) + 1
}

export function createTextElement(
  page: number,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  content = DEFAULT_TEXT_ELEMENT.content,
): TextElement {
  return {
    ...DEFAULT_TEXT_ELEMENT,
    id: createElementId(),
    page,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex,
    opacity: 1,
    content,
  }
}

export function createShapeElement(
  shape: ShapeKind,
  page: number,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): ShapeElement {
  const element: ShapeElement = {
    ...DEFAULT_SHAPE_ELEMENT,
    id: createElementId(),
    shape,
    page,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex,
    opacity: 1,
  }
  if (shape === 'line' || shape === 'arrow') {
    element.fillColor = null
    element.line = { x1: 0, y1: 0, x2: width, y2: height }
  }
  return element
}

export function createImageElement(
  page: number,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  source: string,
  name: string,
): ImageElement {
  return {
    id: createElementId(),
    type: 'image',
    page,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex,
    opacity: 1,
    lockAspect: true,
    source,
    name,
  }
}

/** Creates a signature element (an image element tagged as a signature). */
export function createSignatureElement(
  page: number,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  source: string,
  name: string,
  signatureId?: string,
): ImageElement {
  return {
    ...createImageElement(page, x, y, width, height, zIndex, source, name),
    kind: 'signature',
    ...(signatureId ? { signatureId } : {}),
  }
}

export function normalizeRotation(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360
  return Math.round(normalized * 10) / 10
}

export function isTextElement(element: PdfElement): element is TextElement {
  return element.type === 'text'
}

export function isImageElement(element: PdfElement): element is ImageElement {
  return element.type === 'image'
}

export function isShapeElement(element: PdfElement): element is ShapeElement {
  return element.type === 'shape'
}

export function elementsForPage(
  elements: readonly PdfElement[],
  page: number,
): PdfElement[] {
  return elements
    .filter((element) => element.page === page)
    .sort((a, b) => a.zIndex - b.zIndex)
}

/* ------------------------------------------------------------------ *
 * Geometry helpers (PDF-point space, top-left origin)
 * ------------------------------------------------------------------ */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Rotates a point about a center by `rotation` degrees (positive =
 * clockwise in the top-left coordinate system).
 */
export function rotatePoint(point: Point, center: Point, rotation: number): Point {
  const angle = (rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

export function inverseRotatePoint(
  point: Point,
  center: Point,
  rotation: number,
): Point {
  return rotatePoint(point, center, -rotation)
}

export function elementCenter(element: PdfElement): Point {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  }
}

/**
 * True when a point (top-left origin) is inside the element's rotated box.
 */
export function hitTestElement(
  element: PdfElement,
  point: Point,
): boolean {
  if (element.rotation === 0) {
    return (
      point.x >= element.x &&
      point.x <= element.x + element.width &&
      point.y >= element.y &&
      point.y <= element.y + element.height
    )
  }
  const local = inverseRotatePoint(point, elementCenter(element), element.rotation)
  return (
    local.x >= element.x &&
    local.x <= element.x + element.width &&
    local.y >= element.y &&
    local.y <= element.y + element.height
  )
}

/** Returns the topmost element at a point (null when nothing is hit). */
export function hitTestElements(
  elements: readonly PdfElement[],
  point: Point,
): PdfElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    if (hitTestElement(elements[index], point)) return elements[index]
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

export function serializeElements(elements: readonly PdfElement[]): string {
  const model: ElementModel = {
    version: ELEMENT_MODEL_VERSION,
    elements: [...elements],
  }
  return JSON.stringify(model)
}

export function parseElements(json: string): PdfElement[] | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null
    const model = parsed as Partial<ElementModel>
    if (model.version !== ELEMENT_MODEL_VERSION || !Array.isArray(model.elements)) {
      return null
    }
    return model.elements
      .map(normalizeElement)
      .filter((element): element is PdfElement => element !== null)
  } catch {
    return null
  }
}

/** Fills defaults for fields added after an element was first persisted. */
function normalizeElement(value: unknown): PdfElement | null {
  if (!isPdfElement(value)) return null
  if (value.type === 'text') {
    return { ...value, opacity: value.opacity ?? 1, lineHeight: value.lineHeight ?? 1.25 }
  }
  if (value.type === 'image') {
    return { ...value, opacity: value.opacity ?? 1, lockAspect: value.lockAspect ?? true }
  }
  return { ...value, opacity: value.opacity ?? 1, cornerRadius: value.cornerRadius ?? 0 }
}

function isPdfElement(value: unknown): value is PdfElement {
  if (!value || typeof value !== 'object') return false
  const element = value as Record<string, unknown>
  if (typeof element.id !== 'string') return false
  if (element.type !== 'text' && element.type !== 'image' && element.type !== 'shape') {
    return false
  }
  return (
    typeof element.page === 'number' &&
    typeof element.x === 'number' &&
    typeof element.y === 'number' &&
    typeof element.width === 'number' &&
    typeof element.height === 'number' &&
    typeof element.rotation === 'number' &&
    typeof element.zIndex === 'number'
  )
}

/* ------------------------------------------------------------------ *
 * Page-composition remapping (kept in sync with page operations)
 * ------------------------------------------------------------------ */

export function remapElementsAfterDelete(
  elements: readonly PdfElement[],
  deletedIndices: number[],
): PdfElement[] {
  const deleted = new Set(deletedIndices)
  const sorted = [...deletedIndices].sort((a, b) => a - b)
  return elements
    .filter((element) => !deleted.has(element.page))
    .map((element) => {
      const shift = sorted.filter((index) => index < element.page).length
      return shift > 0 ? { ...element, page: element.page - shift } : element
    })
}

export function remapElementsAfterInsert(
  elements: readonly PdfElement[],
  insertIndex: number,
  count: number,
): PdfElement[] {
  return elements.map((element) =>
    element.page >= insertIndex
      ? { ...element, page: element.page + count }
      : element,
  )
}

export function remapElementsAfterReorder(
  elements: readonly PdfElement[],
  order: number[],
  pageCount: number,
): PdfElement[] {
  const newIndex: number[] = new Array(pageCount)
  order.forEach((oldIndex, position) => {
    newIndex[oldIndex] = position
  })
  return elements.map((element) => ({
    ...element,
    page: newIndex[element.page] ?? element.page,
  }))
}

/** Drops elements that lived on a replaced page (the page still exists). */
export function remapElementsAfterReplace(
  elements: readonly PdfElement[],
  index: number,
): PdfElement[] {
  return elements.filter((element) => element.page !== index)
}

/**
 * Maps a point between the on-screen (display) space — origin top-left, y
 * down — and the page's unrotated content space — origin bottom-left, y up —
 * for a page displayed with the given /Rotate value. `pageWidth`/`pageHeight`
 * are the unrotated media box dimensions. Mirrors the pdf.js viewport
 * transform so both the export and page-rotation remap stay in sync.
 */
function mapDisplayToUser(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
): { x: number; y: number } {
  switch (normalizeRotation(pageRotation)) {
    case 90:
      return { x: y, y: x }
    case 180:
      return { x: pageWidth - x, y: pageHeight - y }
    case 270:
      return { x: pageWidth - y, y: pageHeight - x }
    default:
      return { x, y: pageHeight - y }
  }
}

function mapUserToDisplay(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
): { x: number; y: number } {
  switch (normalizeRotation(pageRotation)) {
    case 90:
      return { x: y, y: x }
    case 180:
      return { x: pageWidth - x, y: pageHeight - y }
    case 270:
      return { x: pageHeight - y, y: pageWidth - x }
    default:
      return { x, y: pageHeight - y }
  }
}

/**
 * Re-expresses elements in the new display space after a page's /Rotate
 * changed by a quarter turn. Elements keep their box size and content
 * geometry; only their center position and screen rotation move, so the
 * overlay stays glued to the content on the re-rendered page.
 */
export function remapElementsAfterPageRotate(
  elements: readonly PdfElement[],
  pageIndex: number,
  direction: RotationDirection,
  pageWidth: number,
  pageHeight: number,
  oldRotation: number,
): PdfElement[] {
  const step = direction === 'clockwise' ? 90 : -90
  const newRotation = normalizeRotation(oldRotation + step)
  return elements.map((element) => {
    if (element.page !== pageIndex) return element
    const inUserSpace = mapDisplayToUser(
      element.x + element.width / 2,
      element.y + element.height / 2,
      pageWidth,
      pageHeight,
      oldRotation,
    )
    const center = mapUserToDisplay(
      inUserSpace.x,
      inUserSpace.y,
      pageWidth,
      pageHeight,
      newRotation,
    )
    return {
      ...element,
      x: center.x - element.width / 2,
      y: center.y - element.height / 2,
      rotation: normalizeRotation(element.rotation + step),
    }
  })
}

/** Duplicates elements for copied pages; `copies` maps old → new page index. */
export function duplicateElementsForPages(
  elements: readonly PdfElement[],
  copies: Array<{ from: number; to: number }>,
): PdfElement[] {
  const byPage = new Map<number, PdfElement[]>()
  for (const element of elements) {
    const list = byPage.get(element.page) ?? []
    list.push(element)
    byPage.set(element.page, list)
  }
  const duplicates: PdfElement[] = []
  for (const { from, to } of copies) {
    const source = byPage.get(from) ?? []
    for (const element of source) {
      duplicates.push({ ...element, id: createElementId(), page: to })
    }
  }
  return duplicates
}

/* ------------------------------------------------------------------ *
 * Text estimation (browser side; export wraps with pdf-lib metrics)
 * ------------------------------------------------------------------ */

export const TEXT_LINE_HEIGHT = 1.25

export function estimateTextSize(
  content: string,
  fontSize: number,
): { width: number; height: number } {
  const lines = content.split('\n')
  const charWidth = fontSize * 0.55
  const width = Math.max(
    24,
    ...lines.map((line) => Math.ceil(line.length * charWidth)),
  )
  const height = Math.ceil(lines.length * fontSize * TEXT_LINE_HEIGHT)
  return { width: Math.min(width, 600), height: Math.max(height, fontSize * TEXT_LINE_HEIGHT) }
}
