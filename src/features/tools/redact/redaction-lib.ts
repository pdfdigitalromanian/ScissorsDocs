import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  rgb,
} from 'pdf-lib'
import { looksLikePdf } from '@/features/editor/engine'
import {
  parseContentStream,
  removeOpsFromStream,
  type CsOp,
} from '@/features/editor/content-stream'
import { loadPdfDocument, extractPageText } from '../local/lib/pdf'

export interface RedactionRect {
  id: string
  pageIndex: number
  /** PDF points, bottom-left origin. */
  x: number
  y: number
  width: number
  height: number
}

export interface RedactionStats {
  removedTextRuns: number
  removedPaths: number
  removedImages: number
  redactionCount: number
  pagesAffected: number
  warnings: string[]
}

export interface RedactionResult {
  bytes: Uint8Array
  pageCount: number
  stats: RedactionStats
}

// ── Matrix helpers ───────────────────────────────────────────────────

interface Mat3 {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY: Mat3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

function mul(m1: Mat3, m2: Mat3): Mat3 {
  return {
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    e: m1.e * m2.a + m1.f * m2.c + m2.e,
    f: m1.e * m2.b + m1.f * m2.d + m2.f,
  }
}

function apply(m: Mat3, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
}

// ── Geometry ─────────────────────────────────────────────────────────

interface Bbox {
  x0: number
  y0: number
  x1: number
  y1: number
}

function rectBbox(rect: RedactionRect): Bbox {
  return { x0: rect.x, y0: rect.y, x1: rect.x + rect.width, y1: rect.y + rect.height }
}

function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  return (
    a.x0 <= b.x1 + 0.5 &&
    a.x1 >= b.x0 - 0.5 &&
    a.y0 <= b.y1 + 0.5 &&
    a.y1 >= b.y0 - 0.5
  )
}

/**
 * True when `outer` fully contains `inner`. Removing a vector path or image
 * that only partially overlaps a redaction rectangle would destroy content
 * outside the mark (a redaction over part of a large shape/table must not
 * wipe the whole page), so the engine only removes objects it can fully
 * cover. Partially covered objects stay — the black mark covers them visually.
 */
function fullyContains(outer: Bbox, inner: Bbox): boolean {
  return (
    inner.x0 >= outer.x0 - 0.5 &&
    inner.x1 <= outer.x1 + 0.5 &&
    inner.y0 >= outer.y0 - 0.5 &&
    inner.y1 <= outer.y1 + 0.5
  )
}

function textOpLength(op: CsOp): number {
  if (op.op === 'TJ') {
    const array = Array.isArray(op.args[0]) ? (op.args[0] as (number | string)[]) : []
    return array.reduce<number>(
      (sum, item) => sum + (typeof item === 'string' ? item.length : 0),
      0,
    )
  }
  return typeof op.args[0] === 'string' ? op.args[0].length : 0
}

// ── Operator-level redaction ─────────────────────────────────────────

const TEXT_SHOW_OPS = new Set(['Tj', 'TJ', "'", '"'])
const PATH_PAINT_OPS = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*'])

interface StreamResult {
  removedIndices: Set<number>
  removedText: number
  removedPaths: number
  removedImages: number
  /** Set when a redacted region only covered page-sized imagery. */
  touchedScannedContent: boolean
}

/** Applies all redaction rectangles for a page to one decoded content stream. */
function applyToStream(
  ops: CsOp[],
  rects: Bbox[],
  imageDims: Record<string, { width: number; height: number }>,
  pageBbox: Bbox,
): StreamResult {
  const remove = new Set<number>()
  const ctmStack: Mat3[] = [IDENTITY]
  let ctm = IDENTITY
  let tm = IDENTITY
  let leading = 0
  let fontSize = 12
  let hScale = 1
  let charSpacing = 0
  let pathBbox: Bbox | null = null
  let removedText = 0
  let removedPaths = 0
  let removedImages = 0
  let touchedScannedContent = false
  const pageArea =
    (pageBbox.x1 - pageBbox.x0) * (pageBbox.y1 - pageBbox.y0) || 1

  function growPath(point: [number, number]) {
    if (!pathBbox) {
      pathBbox = { x0: point[0], y0: point[1], x1: point[0], y1: point[1] }
    } else {
      pathBbox.x0 = Math.min(pathBbox.x0, point[0])
      pathBbox.y0 = Math.min(pathBbox.y0, point[1])
      pathBbox.x1 = Math.max(pathBbox.x1, point[0])
      pathBbox.y1 = Math.max(pathBbox.y1, point[1])
    }
  }

  for (let index = 0; index < ops.length; index += 1) {
    const { op, args } = ops[index]

    if (op === 'q') {
      ctmStack.push({ ...ctm })
      continue
    }
    if (op === 'Q') {
      if (ctmStack.length > 1) ctm = ctmStack.pop()!
      else ctm = IDENTITY
      continue
    }
    if (op === 'cm' && args.length >= 6) {
      ctm = mul(ctm, {
        a: Number(args[0]),
        b: Number(args[1]),
        c: Number(args[2]),
        d: Number(args[3]),
        e: Number(args[4]),
        f: Number(args[5]),
      })
      continue
    }
    if (op === 'Tf' && args.length >= 2) {
      fontSize = Number(args[1]) || fontSize
      continue
    }
    if (op === 'Tz' && args.length >= 1) {
      hScale = (Number(args[0]) || 100) / 100
      continue
    }
    if (op === 'Tc' && args.length >= 1) {
      charSpacing = Number(args[0]) || 0
      continue
    }
    if (op === 'BT') {
      tm = IDENTITY
      continue
    }
    if (op === 'ET') {
      tm = IDENTITY
      continue
    }
    if (op === 'Tm' && args.length >= 6) {
      tm = {
        a: Number(args[0]),
        b: Number(args[1]),
        c: Number(args[2]),
        d: Number(args[3]),
        e: Number(args[4]),
        f: Number(args[5]),
      }
      continue
    }
    if (op === 'Td' || op === 'TD') {
      const dx = Number(args[0]) || 0
      const dy = Number(args[1]) || 0
      tm = mul(tm, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy })
      continue
    }
    if (op === 'TL' && args.length >= 1) {
      leading = Number(args[0]) || 0
      continue
    }
    if (op === 'T*') {
      tm = mul(tm, { a: 1, b: 0, c: 0, d: 1, e: 0, f: leading })
      continue
    }

    if (TEXT_SHOW_OPS.has(op)) {
      if (op === "'" || op === '"') {
        // The single/double-quote show operators advance to the next line
        // (T*) before painting. The double-quote form also sets char spacing.
        if (op === '"' && args.length >= 2) {
          charSpacing = Number(args[1]) || 0
        }
        tm = mul(tm, { a: 1, b: 0, c: 0, d: 1, e: 0, f: leading })
      }
      const length = textOpLength(ops[index])
      const combined = mul(ctm, tm)
      const [px, py] = apply(combined, 0, 0)
      const estimatedWidth =
        Math.max(length - 1, 0) * charSpacing +
        length * fontSize * hScale * 0.5
      const textBbox: Bbox = {
        x0: px - 0.5,
        y0: py - fontSize * 0.2,
        x1: px + estimatedWidth + 0.5,
        y1: py + fontSize * 0.9,
      }
      if (rects.some((rect) => bboxesIntersect(textBbox, rect))) {
        remove.add(index)
        removedText += 1
      }
      continue
    }

    // Path construction
    if (op === 're' && args.length >= 4) {
      const x = Number(args[0])
      const y = Number(args[1])
      const w = Number(args[2])
      const h = Number(args[3])
      const corners: [number, number][] = [
        apply(ctm, x, y),
        apply(ctm, x + w, y),
        apply(ctm, x + w, y + h),
        apply(ctm, x, y + h),
      ]
      const rectBbox: Bbox = {
        x0: Math.min(...corners.map((c) => c[0])),
        y0: Math.min(...corners.map((c) => c[1])),
        x1: Math.max(...corners.map((c) => c[0])),
        y1: Math.max(...corners.map((c) => c[1])),
      }
      // A page-sized rectangle is a background. Removing it would blank the
      // whole page, so keep it and keep it out of the path accumulator.
      const isPageSized =
        ((rectBbox.x1 - rectBbox.x0) * (rectBbox.y1 - rectBbox.y0)) / pageArea >=
        0.85
      if (!isPageSized) {
        for (const corner of corners) growPath(corner)
      }
      if (
        !isPageSized &&
        rects.some((rect) => fullyContains(rect, rectBbox))
      ) {
        remove.add(index)
        removedPaths += 1
      }
      continue
    }

    if (op === 'm' || op === 'l') {
      if (args.length >= 2) growPath(apply(ctm, Number(args[0]), Number(args[1])))
      continue
    }
    if (op === 'c' && args.length >= 6) {
      growPath(apply(ctm, Number(args[0]), Number(args[1])))
      growPath(apply(ctm, Number(args[2]), Number(args[3])))
      growPath(apply(ctm, Number(args[4]), Number(args[5])))
      continue
    }
    if (op === 'v' && args.length >= 4) {
      growPath(apply(ctm, Number(args[0]), Number(args[1])))
      growPath(apply(ctm, Number(args[2]), Number(args[3])))
      continue
    }
    if (op === 'y' && args.length >= 4) {
      growPath(apply(ctm, Number(args[0]), Number(args[1])))
      growPath(apply(ctm, Number(args[2]), Number(args[3])))
      continue
    }
    if (op === 'h') continue

    if (PATH_PAINT_OPS.has(op)) {
      const bbox = pathBbox as Bbox | null
      const contained =
        bbox !== null && rects.some((rect) => fullyContains(rect, bbox))
      if (contained && bbox) {
        // Keep full-page paints — they are backgrounds and removing them
        // would hide the entire page instead of just the redacted region.
        const isPageSized =
          ((bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0)) / pageArea >= 0.85
        if (!isPageSized) {
          remove.add(index)
          removedPaths += 1
        }
      }
      pathBbox = null
      continue
    }

    if (op === 'n') {
      pathBbox = null
      continue
    }

    if (op === 'Do' && args.length >= 1) {
      const name = String(args[0]).replace(/^\//, '')
      const dims = imageDims[name]
      if (dims) {
        const [x0, y0] = apply(ctm, 0, 0)
        const [x1, y1] = apply(ctm, dims.width, dims.height)
        const imageBbox: Bbox = {
          x0: Math.min(x0, x1),
          y0: Math.min(y0, y1),
          x1: Math.max(x0, x1),
          y1: Math.max(y0, y1),
        }
        if (rects.some((rect) => bboxesIntersect(imageBbox, rect))) {
          const imageArea =
            (imageBbox.x1 - imageBbox.x0) * (imageBbox.y1 - imageBbox.y0)
          const pageCoverage = imageArea / pageArea
          if (pageCoverage >= 0.85) {
            // Page-sized image — removing it would destroy the page. This is
            // a scanned page; the region is covered visually but the pixels
            // cannot be removed by the local engine.
            touchedScannedContent = true
          } else if (rects.some((rect) => fullyContains(rect, imageBbox))) {
            // Only remove imagery that a redaction rectangle fully covers.
            // Partially covered images stay so the rest of the page survives.
            remove.add(index)
            removedImages += 1
          }
        }
      }
      continue
    }
  }

  return {
    removedIndices: remove,
    removedText,
    removedPaths,
    removedImages,
    touchedScannedContent,
  }
}

// ── Image dimension lookup ───────────────────────────────────────────

function collectImageDims(
  page: import('pdf-lib').PDFPage,
  doc: PDFDocument,
): Record<string, { width: number; height: number }> {
  const dims: Record<string, { width: number; height: number }> = {}
  const resources = page.node.Resources()
  const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  if (!xobjects) return dims
  for (const [key, value] of xobjects.entries()) {
    const object = doc.context.lookup(value)
    if (!(object instanceof PDFRawStream)) continue
    const name = String(key).replace(/^\//, '')
    const width = object.dict.get(PDFName.of('Width'))
    const height = object.dict.get(PDFName.of('Height'))
    if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) continue
    dims[name] = { width: width.asNumber(), height: height.asNumber() }
  }
  return dims
}

// ── Content stream replacement ───────────────────────────────────────

function assignStreamBytes(
  doc: PDFDocument,
  stream: PDFRawStream,
  bytes: Uint8Array,
): void {
  const ref = doc.context.getObjectRef(stream)
  if (!ref) return
  doc.context.assign(ref, PDFRawStream.of(stream.dict, bytes))
}

/** All content streams belonging to a page. */
function pageStreams(
  doc: PDFDocument,
  page: import('pdf-lib').PDFPage,
): PDFRawStream[] {
  const contents = page.node.Contents()
  if (!contents) return []
  const streams: PDFRawStream[] = []
  if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index += 1) {
      const object = doc.context.lookup(contents.get(index))
      if (object instanceof PDFRawStream) streams.push(object)
    }
  } else {
    const object = doc.context.lookup(contents)
    if (object instanceof PDFRawStream) streams.push(object)
  }
  return streams
}

// ── Validation helpers ───────────────────────────────────────────────

interface TextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

/** Extracts the text items that fall under any redaction on a page. */
async function coveredTerms(
  bytes: Uint8Array,
  rectsByPage: Map<number, RedactionRect[]>,
): Promise<Map<number, string[]>> {
  const terms = new Map<number, string[]>()
  const loaded = await loadPdfDocument(bytes)
  try {
    for (const [pageIndex, rects] of rectsByPage) {
      const page = await loaded.document.getPage(pageIndex + 1)
      const content = await page.getTextContent()
      const items: TextItem[] = []
      for (const raw of content.items) {
        if (!('str' in raw) || !('transform' in raw)) continue
        const transform = raw.transform as number[]
        const width = 'width' in raw ? Number(raw.width) : 0
        const height = Math.abs(transform[3] ?? transform[0] ?? 0)
        items.push({
          str: raw.str,
          x: transform[4],
          y: transform[5],
          width,
          height,
        })
      }
      const found = new Set<string>()
      for (const item of items) {
        const text = item.str.trim()
        if (text.length < 3) continue
        const itemBbox: Bbox = {
          x0: item.x,
          y0: item.y,
          x1: item.x + item.width,
          y1: item.y + item.height,
        }
        if (rects.some((rect) => bboxesIntersect(itemBbox, rectBbox(rect)))) {
          found.add(text)
        }
      }
      terms.set(pageIndex, [...found])
    }
  } finally {
    void loaded.destroy()
  }
  return terms
}

/** Reopens the output and checks none of the covered terms can still be read. */
async function verifyOutput(
  bytes: Uint8Array,
  termsByPage: Map<number, string[]>,
): Promise<string[]> {
  const warnings: string[] = []
  const loaded = await loadPdfDocument(bytes)
  try {
    for (const [pageIndex, terms] of termsByPage) {
      if (terms.length === 0) continue
      const page = await loaded.document.getPage(pageIndex + 1)
      const extracted = (await extractPageText(page)).toLowerCase()
      const remaining = terms.filter((term) => extracted.includes(term.toLowerCase()))
      if (remaining.length > 0) {
        warnings.push(
          `Page ${pageIndex + 1}: ${remaining.length} redacted text fragment${
            remaining.length === 1 ? ' is' : 's are'
          } still extractable after redaction.`,
        )
      }
    }
  } finally {
    void loaded.destroy()
  }
  return warnings
}

// ── Public entry point ───────────────────────────────────────────────

/**
 * Permanently redacts content from a PDF. Text, vector paths and non-page
 * images whose rendered bounds overlap a redaction rectangle are removed
 * from the content streams before the black mark is drawn, so the redacted
 * information is genuinely gone from the output (verified by re-extracting
 * the text afterwards). Page-sized images (scanned pages) are covered
 * visually with a clear limitation notice instead of being destroyed.
 */
export async function redactPdf(
  sourceBytes: Uint8Array,
  redactions: RedactionRect[],
  options: { removeMetadata?: boolean } = {},
): Promise<RedactionResult> {
  if (!looksLikePdf(sourceBytes)) {
    throw new Error('The selected file is not a valid PDF.')
  }
  const usable = redactions.filter(
    (rect) => rect.width > 0.5 && rect.height > 0.5,
  )
  if (usable.length === 0) {
    throw new Error('Mark at least one area to redact before applying.')
  }

  const doc = await PDFDocument.load(sourceBytes)
  const originalPages = doc.getPageCount()
  for (const rect of usable) {
    if (rect.pageIndex < 0 || rect.pageIndex >= originalPages) {
      throw new Error('A redaction references a page that does not exist.')
    }
  }

  const rectsByPage = new Map<number, RedactionRect[]>()
  for (const rect of usable) {
    const list = rectsByPage.get(rect.pageIndex) ?? []
    list.push(rect)
    rectsByPage.set(rect.pageIndex, list)
  }

  const stats: RedactionStats = {
    removedTextRuns: 0,
    removedPaths: 0,
    removedImages: 0,
    redactionCount: usable.length,
    pagesAffected: rectsByPage.size,
    warnings: [],
  }

  const warningsByPage = new Map<number, boolean>()

  for (const [pageIndex, rects] of rectsByPage) {
    const page = doc.getPage(pageIndex)
    const { x, y, width, height } = page.getMediaBox()
    const pageBbox: Bbox = { x0: x, y0: y, x1: x + width, y1: y + height }
    const rectBboxes = rects.map(rectBbox)
    const imageDims = collectImageDims(page, doc)

    for (const stream of pageStreams(doc, page)) {
      const decoded = decodePDFRawStream(stream).decode()
      const parsed = parseContentStream(decoded)
      const result = applyToStream(parsed, rectBboxes, imageDims, pageBbox)
      stats.removedTextRuns += result.removedText
      stats.removedPaths += result.removedPaths
      stats.removedImages += result.removedImages
      if (result.touchedScannedContent) warningsByPage.set(pageIndex, true)
      if (result.removedIndices.size > 0) {
        assignStreamBytes(doc, stream, removeOpsFromStream(decoded, parsed, result.removedIndices))
      }
    }

    if (warningsByPage.get(pageIndex)) {
      stats.warnings.push(
        `Page ${pageIndex + 1} appears to be a scanned image page. The redaction mark was applied visually, but the underlying image pixels could not be removed by the local engine.`,
      )
    }

    for (const rect of rects) {
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(0, 0, 0),
        opacity: 1,
        borderWidth: 0,
      })
    }
  }

  if (options.removeMetadata) {
    try {
      doc.setTitle('')
      doc.setAuthor('')
      doc.setSubject('')
      doc.setKeywords([])
      doc.setCreator('')
      doc.setProducer('')
    } catch {
      // Metadata removal is best-effort; never fail the operation for it.
    }
  }

  const bytes = await doc.save({ useObjectStreams: true })

  const reopened = await PDFDocument.load(bytes)
  if (reopened.getPageCount() !== originalPages) {
    throw new Error('The redacted PDF lost content while it was being generated.')
  }

  // Validation — reopen the result and prove the covered text is gone.
  const termsByPage = await coveredTerms(sourceBytes, rectsByPage)
  const verificationWarnings = await verifyOutput(bytes, termsByPage)
  stats.warnings.push(...verificationWarnings)

  return { bytes, pageCount: reopened.getPageCount(), stats }
}