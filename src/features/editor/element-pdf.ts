/**
 * pdf-lib integration for the element model.
 *
 * Every commit serializes the element model into a dedicated, tagged
 * content stream per page AND writes the JSON model into the document
 * catalog. Reopening the exported PDF keeps the model so elements stay
 * editable; the tagged streams are stripped before a re-draw so nothing
 * is ever painted twice. Any other PDF viewer sees the edits as ordinary
 * page content.
 */
import {
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRef,
  PDFStream,
  StandardFonts,
  rgb,
  degrees,
  LineCapStyle,
} from 'pdf-lib'
import type { PDFFont, PDFOperator } from 'pdf-lib'
import {
  concatTransformationMatrix,
  pushGraphicsState,
  popGraphicsState,
  setGraphicsState,
  setLineWidth,
  setLineCap,
  setStrokingRgbColor,
  setFillingRgbColor,
  rectangle,
  fillAndStroke,
  fill,
  stroke,
  moveTo,
  lineTo,
  closePath,
  appendBezierCurve,
  drawImage,
  drawTextLines,
} from 'pdf-lib'
import type {
  PdfElement,
  ShapeElement,
  TextElement,
  ImageElement,
  FontFamily,
  LinePoints,
} from './elements'
import { parseElements, serializeElements } from './elements'

const MODEL_KEY = 'ScissorsDocElements'
const ELEMENT_STREAM_MARKER = 'SDocElements'

/* ------------------------------------------------------------------ *
 * Fonts
 * ------------------------------------------------------------------ */

const STANDARD_FONT_KEYS: Record<
  FontFamily,
  Record<'regular' | 'bold' | 'italic' | 'boldItalic', StandardFonts>
> = {
  helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
}

function fontKeyFor(element: TextElement): StandardFonts {
  const table = STANDARD_FONT_KEYS[element.fontFamily] ?? STANDARD_FONT_KEYS.helvetica
  if (element.bold && element.italic) return table.boldItalic
  if (element.bold) return table.bold
  if (element.italic) return table.italic
  return table.regular
}

/* ------------------------------------------------------------------ *
 * Model persistence (document catalog)
 * ------------------------------------------------------------------ */

/** Reads the element model embedded in a document (empty when absent). */
export function readElementsFromDoc(doc: PDFDocument): PdfElement[] {
  try {
    const entry = doc.catalog.lookupMaybe(PDFName.of(MODEL_KEY), PDFStream)
    if (!entry) return []
    const raw = entry as unknown as { contents?: Uint8Array }
    const contents = raw.contents
    if (!contents) return []
    const json = new TextDecoder().decode(contents)
    return parseElements(json) ?? []
  } catch {
    return []
  }
}

/** Writes the element model into the document catalog. */
export function writeElementsToDoc(doc: PDFDocument, elements: readonly PdfElement[]): void {
  const key = PDFName.of(MODEL_KEY)
  if (elements.length === 0) {
    doc.catalog.delete(key)
    return
  }
  const stream = doc.context.stream(serializeElements(elements))
  doc.catalog.set(key, doc.context.register(stream))
}

/** Removes every tagged element content stream from the document pages. */
export function stripElementStreams(doc: PDFDocument): void {
  const marker = PDFName.of(ELEMENT_STREAM_MARKER)
  for (const page of doc.getPages()) {
    const { Contents } = page.node.normalizedEntries()
    if (!Contents) continue

    if (Contents instanceof PDFStream) {
      if (Contents.dict.has(marker)) {
        page.node.set(PDFName.of('Contents'), doc.context.obj([]))
      }
      continue
    }

    const kept: Array<PDFRef | PDFStream> = []
    let changed = false
    for (const entry of Contents.asArray()) {
      if (entry instanceof PDFRef) {
        const object = doc.context.lookup(entry)
        if (object instanceof PDFStream && object.dict.has(marker)) {
          changed = true
          continue
        }
      }
      kept.push(entry as PDFRef | PDFStream)
    }
    if (changed) {
      page.node.set(PDFName.of('Contents'), doc.context.obj(kept))
    }
  }
}

/**
 * Produces a PDF whose element content streams have been removed, so the
 * live element overlay is the only thing painting the editable elements.
 * Used while edit mode is on to avoid showing a baked copy of the elements
 * underneath the interactive overlay (the "ghost duplicate" bug).
 */
export async function stripElementStreamsFromBytes(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  stripElementStreams(doc)
  return doc.save()
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const number = Number.parseInt(value, 16)
  if (Number.isNaN(number)) return { r: 0, g: 0, b: 0 }
  return {
    r: ((number >> 16) & 0xff) / 255,
    g: ((number >> 8) & 0xff) / 255,
    b: (number & 0xff) / 255,
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * Rotation transform (about the element center) in PDF content space.
 * `rotation` is clockwise as seen on screen; content space is y-up so the
 * applied angle is negated.
 */
function rotationMatrix(
  centerX: number,
  centerY: number,
  rotation: number,
): PDFOperator {
  const angle = (-rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return concatTransformationMatrix(
    cos,
    sin,
    -sin,
    cos,
    centerX - centerX * cos + centerY * sin,
    centerY - centerX * sin - centerY * cos,
  )
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360
}

/**
 * Registers a graphics state for the given opacity and returns the operator
 * that selects it. Returns null when no opacity is needed (>= 1), so callers
 * can skip the overhead entirely.
 */
function opacityStateOp(page: PDFPage, opacity: number | undefined): PDFOperator | null {
  const value = opacity ?? 1
  if (value >= 1) return null
  const clamped = Math.max(0, Math.min(1, value))
  const graphicsState = page.doc.context.obj({
    Type: 'ExtGState',
    ca: clamped,
    CA: clamped,
  })
  const key = page.node.newExtGState('GS', graphicsState)
  return setGraphicsState(key)
}

/**
 * Maps a point from the on-screen (display) coordinate system — origin at the
 * page's top-left, y down — into the PDF page's unrotated content space —
 * origin at the bottom-left, y up. `pageRotation` is the page's /Rotate value
 * (0/90/180/270) and `pageWidth`/`pageHeight` are the unrotated media box
 * dimensions.
 *
 * The mapping mirrors pdf.js: rotating a page r degrees clockwise for display
 * makes the displayed point (x, y) correspond to the content-space point
 * returned here. Verified against pdfjs PageViewport for every rotation.
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

/**
 * Projects an element stored in display coordinates onto the unrotated page
 * content space so it renders identically after the page's /Rotate is applied
 * by a viewer.
 *
 * Because the page transform is an isometry, the element keeps its on-screen
 * box size and its content-local geometry; only the box's center position and
 * the rotation that the draw helpers apply need to change. The draw helpers
 * rotate the whole box about its own center, so we translate the display
 * center into content space and recentre a same-size box there.
 */
function projectElementForPage(
  element: PdfElement,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
): PdfElement {
  const rotation = normalizeRotation(pageRotation)
  if (rotation === 0) return element
  const center = mapDisplayToUser(
    element.x + element.width / 2,
    element.y + element.height / 2,
    pageWidth,
    pageHeight,
    rotation,
  )
  return {
    ...element,
    x: center.x - element.width / 2,
    y: pageHeight - center.y - element.height / 2,
    rotation: normalizeRotation(element.rotation - rotation),
  }
}

function wrapLines(
  content: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const result: string[] = []
  for (const paragraph of content.split('\n')) {
    if (paragraph.length === 0) {
      result.push('')
      continue
    }
    const words = paragraph.split(/\s+/)
    let line = ''
    for (const word of words) {
      const candidate = line.length === 0 ? word : `${line} ${word}`
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || line.length === 0) {
        line = candidate
      } else {
        result.push(line)
        line = word
      }
    }
    result.push(line)
  }
  return result
}

function drawTextElement(
  page: PDFPage,
  element: TextElement,
  pageHeight: number,
  font: PDFFont,
): PDFOperator[] {
  const fontSize = Math.max(1, element.fontSize)
  const boxLeft = element.x
  const boxTop = pageHeight - element.y
  const maxWidth = Math.max(1, element.width)
  const lineHeight = fontSize * (element.lineHeight ?? 1.25)
  const lines = wrapLines(element.content, font, fontSize, maxWidth)

  const centerX = element.x + element.width / 2
  const centerY = pageHeight - (element.y + element.height / 2)

  const { r, g, b } = hexToRgb(element.color)
  const color = rgb(r, g, b)
  const fontKey = page.node.newFontDictionary('F', font.ref)

  const positioned: Array<{ encoded: ReturnType<PDFFont['encodeText']>; x: number; y: number }> = []
  lines.forEach((line, index) => {
    const width = font.widthOfTextAtSize(line, fontSize)
    const x =
      element.alignment === 'center'
        ? boxLeft + (maxWidth - width) / 2
        : element.alignment === 'right'
          ? boxLeft + maxWidth - width
          : boxLeft
    const y = boxTop - fontSize * 0.8 - index * lineHeight
    positioned.push({ encoded: font.encodeText(line), x, y })
  })

  const ops: PDFOperator[] = [pushGraphicsState()]
  const opacity = opacityStateOp(page, element.opacity)
  if (opacity) ops.push(opacity)
  ops.push(
    rotationMatrix(centerX, centerY, element.rotation),
    ...drawTextLines(
    positioned.map((line) => ({
      encoded: line.encoded,
      x: line.x,
      y: line.y,
    })),
      {
        font: fontKey,
        size: fontSize,
        color,
        rotate: degrees(0),
        xSkew: degrees(0),
        ySkew: degrees(0),
      },
    ),
    popGraphicsState(),
  )
  return ops
}

function drawImageElement(
  page: PDFPage,
  element: ImageElement,
  pageHeight: number,
  image: EmbeddedImage,
): PDFOperator[] {
  const centerX = element.x + element.width / 2
  const centerY = pageHeight - (element.y + element.height / 2)
  const key = page.node.newXObject('Image', image.ref)
  const ops: PDFOperator[] = [pushGraphicsState()]
  const opacity = opacityStateOp(page, element.opacity)
  if (opacity) ops.push(opacity)
  ops.push(
    rotationMatrix(centerX, centerY, element.rotation),
    ...drawImage(key, {
      x: element.x,
      y: pageHeight - (element.y + element.height),
      width: element.width,
      height: element.height,
      rotate: degrees(0),
      xSkew: degrees(0),
      ySkew: degrees(0),
    }),
    popGraphicsState(),
  )
  return ops
}

function drawShapeElement(
  page: PDFPage,
  element: ShapeElement,
  pageHeight: number,
): PDFOperator[] {
  const ops: PDFOperator[] = [pushGraphicsState()]
  const opacity = opacityStateOp(page, element.opacity)
  if (opacity) ops.push(opacity)
  const { x, y, width, height, rotation } = element
  const centerX = x + width / 2
  const centerY = pageHeight - (y + height / 2)
  const pdfBottom = pageHeight - (y + height)

  if (element.rotation !== 0) {
    ops.push(rotationMatrix(centerX, centerY, rotation))
  }

  const hasStroke = element.strokeWidth > 0
  const hasFill = element.fillColor !== null && element.fillColor !== undefined

  if (hasStroke) {
    const strokeColor = hexToRgb(element.strokeColor)
    ops.push(setLineWidth(element.strokeWidth))
    ops.push(setLineCap(LineCapStyle.Round))
    ops.push(setStrokingRgbColor(strokeColor.r, strokeColor.g, strokeColor.b))
  }
  if (hasFill) {
    const fillColor = hexToRgb(element.fillColor ?? '#000000')
    ops.push(setFillingRgbColor(fillColor.r, fillColor.g, fillColor.b))
  }

  if (element.shape === 'rect') {
    const radius = element.cornerRadius ?? 0
    ops.push(
      ...(radius > 0
        ? roundedRectPath(x, pdfBottom, width, height, radius)
        : [rectangle(x, pdfBottom, width, height)]),
    )
    if (hasFill && hasStroke) ops.push(fillAndStroke())
    else if (hasFill) ops.push(fill())
    else if (hasStroke) ops.push(stroke())
  } else if (element.shape === 'ellipse') {
    ops.push(...ellipsePath(x, pdfBottom, width, height))
    ops.push(closePath())
    if (hasFill && hasStroke) ops.push(fillAndStroke())
    else if (hasFill) ops.push(fill())
    else if (hasStroke) ops.push(stroke())
  } else {
    const line = element.line ?? { x1: 0, y1: 0, x2: width, y2: height }
    ops.push(...linePath(element, line, pageHeight))
    if (element.shape === 'arrow') {
      ops.push(...arrowHead(element, line, pageHeight))
    }
  }

  ops.push(popGraphicsState())
  return ops
}

/**
 * A rounded rectangle path in PDF content space (y-up). The corner radius is
 * clamped to the shorter side so the path never inverts for small boxes.
 */
function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): PDFOperator[] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const k = 0.5522847498
  return [
    moveTo(x + r, y),
    lineTo(x + width - r, y),
    appendBezierCurve(
      x + width - r + r * k,
      y,
      x + width,
      y + r - r * k,
      x + width,
      y + r,
    ),
    lineTo(x + width, y + height - r),
    appendBezierCurve(
      x + width,
      y + height - r + r * k,
      x + width - r + r * k,
      y + height,
      x + width - r,
      y + height,
    ),
    lineTo(x + r, y + height),
    appendBezierCurve(
      x + r - r * k,
      y + height,
      x,
      y + height - r + r * k,
      x,
      y + height - r,
    ),
    lineTo(x, y + r),
    appendBezierCurve(
      x,
      y + r - r * k,
      x + r - r * k,
      y,
      x + r,
      y,
    ),
    closePath(),
  ]
}

function ellipsePath(x: number, y: number, width: number, height: number): PDFOperator[] {
  const k = 0.5522847498
  const rx = width / 2
  const ry = height / 2
  const cx = x + rx
  const cy = y + ry
  return [
    moveTo(cx + rx, cy),
    appendBezierCurve(cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry),
    appendBezierCurve(cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy),
    appendBezierCurve(cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry),
    appendBezierCurve(cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy),
  ]
}

function linePath(element: ShapeElement, line: LinePoints, pageHeight: number): PDFOperator[] {
  const x1 = element.x + line.x1
  const y1 = pageHeight - (element.y + line.y1)
  const x2 = element.x + line.x2
  const y2 = pageHeight - (element.y + line.y2)
  return [moveTo(x1, y1), lineTo(x2, y2), stroke()]
}

function arrowHead(element: ShapeElement, line: LinePoints, pageHeight: number): PDFOperator[] {
  const x1 = element.x + line.x1
  const y1 = pageHeight - (element.y + line.y1)
  const x2 = element.x + line.x2
  const y2 = pageHeight - (element.y + line.y2)
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length <= 0) return []
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const size = Math.max(6, element.strokeWidth * 3)
  const wing = Math.min(size, length * 0.5)
  const backX = x2 - ux * wing
  const backY = y2 - uy * wing
  const spread = wing * 0.55
  return [
    moveTo(x2, y2),
    lineTo(backX + px * spread, backY + py * spread),
    stroke(),
    moveTo(x2, y2),
    lineTo(backX - px * spread, backY - py * spread),
    stroke(),
  ]
}

/** Draws every element into tagged content streams on the document. */
export async function drawElements(
  doc: PDFDocument,
  elements: readonly PdfElement[],
): Promise<void> {
  const byPage = new Map<number, PdfElement[]>()
  for (const element of elements) {
    const list = byPage.get(element.page) ?? []
    list.push(element)
    byPage.set(element.page, list)
  }

  for (const [pageIndex, pageElements] of byPage) {
    if (pageIndex < 0 || pageIndex >= doc.getPageCount()) continue
    const page = doc.getPage(pageIndex)
    const pageWidth = page.getWidth()
    const pageHeight = page.getHeight()
    const pageRotation = page.getRotation().angle
    const fontCache = new Map<string, PDFFont>()
    const imageCache = new Map<string, Promise<EmbeddedImage>>()
    const ops: PDFOperator[] = []

    for (const element of pageElements) {
      const projected = projectElementForPage(
        element,
        pageWidth,
        pageHeight,
        pageRotation,
      )
      if (projected.type === 'text') {
        const key = fontKeyFor(projected)
        let font = fontCache.get(key)
        if (!font) {
          font = await doc.embedStandardFont(key)
          fontCache.set(key, font)
        }
        ops.push(...drawTextElement(page, projected, pageHeight, font))
      } else if (projected.type === 'image') {
        const image = await getOrEmbedImage(doc, imageCache, projected.source)
        ops.push(...drawImageElement(page, projected, pageHeight, image))
      } else {
        ops.push(...drawShapeElement(page, projected, pageHeight))
      }
    }

    const stream = doc.context.contentStream(ops, { [ELEMENT_STREAM_MARKER]: true })
    page.node.addContentStream(doc.context.register(stream))
  }
}

type EmbeddedImage = Awaited<ReturnType<PDFDocument['embedPng']>>

async function embedImage(doc: PDFDocument, source: string): Promise<EmbeddedImage> {
  const bytes = dataUrlToBytes(source)
  return source.startsWith('data:image/png')
    ? doc.embedPng(bytes)
    : doc.embedJpg(bytes)
}

async function getOrEmbedImage(
  doc: PDFDocument,
  cache: Map<string, Promise<EmbeddedImage>>,
  source: string,
): Promise<EmbeddedImage> {
  const cached = cache.get(source)
  if (cached) return cached
  const pending = embedImage(doc, source)
  cache.set(source, pending)
  return pending
}

export function hasModelMetadata(doc: PDFDocument): boolean {
  return doc.catalog.has(PDFName.of(MODEL_KEY))
}
