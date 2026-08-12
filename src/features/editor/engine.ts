import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRawStream,
  PDFStream,
  beginText,
  decodePDFRawStream,
  degrees,
  endText,
  EncryptedPDFError,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  rotateAndSkewTextRadiansAndTranslate,
  setCharacterSpacing,
  setCharacterSqueeze,
  setFillingColor,
  setFontAndSize,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from 'pdf-lib'
import type {
  EditorPage,
  PageRange,
  PdfRotation,
  PdfTextEdit,
  RotationDirection,
  SplitMode,
} from './model'
import { editorFontFaceFile } from '@/features/pdf/text-format'

/** A4 portrait size in points, used for blank pages without a reference. */
export const A4_SIZE = { width: 595.28, height: 841.89 }

export type EditorPdfErrorCode =
  'load' | 'unsupported' | 'insert' | 'replace' | 'extract' | 'split' | 'merge'

export class EditorPdfError extends Error {
  readonly code: EditorPdfErrorCode

  constructor(message: string, code: EditorPdfErrorCode) {
    super(message)
    this.name = 'EditorPdfError'
    this.code = code
  }
}

function toEditorError(
  reason: unknown,
  code: EditorPdfError['code'],
): EditorPdfError {
  if (reason instanceof EncryptedPDFError) {
    return new EditorPdfError(
      'This PDF is password-protected and cannot be edited without its password.',
      code,
    )
  }
  if (reason instanceof EditorPdfError) return reason
  if (reason instanceof Error) {
    return new EditorPdfError(
      reason.message || 'The PDF could not be processed locally.',
      code,
    )
  }
  return new EditorPdfError('The PDF could not be processed locally.', code)
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 5 &&
    String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'
  )
}

/** Loads a PDF document for editing, preserving its original metadata. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes)
  } catch (reason) {
    throw toEditorError(reason, looksLikePdf(bytes) ? 'unsupported' : 'load')
  }
}

/** Serializes the document back into PDF bytes. */
export async function serializePdf(doc: PDFDocument): Promise<Uint8Array> {
  try {
    return await doc.save()
  } catch (reason) {
    throw toEditorError(reason, 'unsupported')
  }
}

/** Builds the ordered page descriptors for a document. */
export function describePages(doc: PDFDocument): EditorPage[] {
  return doc.getPages().map((page, index) => ({
    id: `page-${index}`,
    index,
    rotation: normalizeRotation(page.getRotation().angle),
    width: page.getWidth(),
    height: page.getHeight(),
  }))
}

function normalizeRotation(angle: number): PdfRotation {
  const normalized = ((angle % 360) + 360) % 360
  const rounded = Math.round(normalized / 90) * 90
  return (rounded === 360 ? 0 : rounded) as PdfRotation
}

interface ExistingFontResource {
  key: PDFName
  unicodeToCode: Map<string, string>
}

const editorFontData = new Map<string, Promise<Uint8Array>>()

async function loadEditorFont(path: string): Promise<Uint8Array> {
  let pending = editorFontData.get(path)
  if (!pending) {
    pending = fetch(path).then(async (response) => {
      if (!response.ok) {
        throw new EditorPdfError(
          `The selected font file could not be loaded (${response.status}).`,
          'replace',
        )
      }
      return new Uint8Array(await response.arrayBuffer())
    })
    editorFontData.set(path, pending)
  }
  return pending
}

function decodeUnicodeHex(hex: string): string {
  if (hex.length === 0 || hex.length % 4 !== 0) return ''
  const units: number[] = []
  for (let offset = 0; offset < hex.length; offset += 4) {
    units.push(Number.parseInt(hex.slice(offset, offset + 4), 16))
  }
  if (units[0] === 0xfeff) units.shift()
  return String.fromCharCode(...units)
}

function incrementHex(hex: string, amount: number): string {
  return (BigInt(`0x${hex}`) + BigInt(amount))
    .toString(16)
    .padStart(hex.length, '0')
    .toUpperCase()
}

function parseToUnicodeCMap(bytes: Uint8Array): Map<string, string> {
  const source = new TextDecoder().decode(bytes).replace(/%[^\r\n]*/g, '')
  const unicodeToCode = new Map<string, string>()

  for (const section of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of section[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const unicode = decodeUnicodeHex(pair[2])
      if (unicode && !unicodeToCode.has(unicode)) {
        unicodeToCode.set(unicode, pair[1].toUpperCase())
      }
    }
  }

  for (const section of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = section[1]
    const arrayPattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g
    for (const range of body.matchAll(arrayPattern)) {
      const start = Number.parseInt(range[1], 16)
      const end = Number.parseInt(range[2], 16)
      const destinations = [...range[3].matchAll(/<([0-9A-Fa-f]+)>/g)]
      for (
        let code = start, index = 0;
        code <= end && index < destinations.length;
        code += 1, index += 1
      ) {
        const unicode = decodeUnicodeHex(destinations[index][1])
        if (unicode && !unicodeToCode.has(unicode)) {
          unicodeToCode.set(
            unicode,
            code.toString(16).padStart(range[1].length, '0').toUpperCase(),
          )
        }
      }
    }

    const directBody = body.replace(arrayPattern, '')
    for (const range of directBody.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const start = Number.parseInt(range[1], 16)
      const end = Number.parseInt(range[2], 16)
      for (let code = start; code <= end; code += 1) {
        const unicode = decodeUnicodeHex(incrementHex(range[3], code - start))
        if (unicode && !unicodeToCode.has(unicode)) {
          unicodeToCode.set(
            unicode,
            code.toString(16).padStart(range[1].length, '0').toUpperCase(),
          )
        }
      }
    }
  }

  return unicodeToCode
}

function fontBaseName(dictionary: PDFDict): string | undefined {
  const direct = dictionary.lookupMaybe(PDFName.of('BaseFont'), PDFName)
  if (direct) return direct.asString().replace(/^\//, '')
  const descendants = dictionary.lookupMaybe(
    PDFName.of('DescendantFonts'),
    PDFArray,
  )
  return descendants
    ?.lookupMaybe(0, PDFDict)
    ?.lookupMaybe(PDFName.of('BaseFont'), PDFName)
    ?.asString()
    .replace(/^\//, '')
}

function findExistingFontResource(
  doc: PDFDocument,
  page: PDFPage,
  pdfFontName: string,
): ExistingFontResource | null {
  const resources = page.node.Resources()
  const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict)
  if (!fonts) return null

  for (const [key, value] of fonts.entries()) {
    const dictionary = doc.context.lookupMaybe(value, PDFDict)
    if (!dictionary || fontBaseName(dictionary) !== pdfFontName) continue
    const toUnicodeObject = dictionary.get(PDFName.of('ToUnicode'))
    const toUnicode = doc.context.lookupMaybe(toUnicodeObject, PDFStream)
    if (!(toUnicode instanceof PDFRawStream)) return null
    const unicodeToCode = parseToUnicodeCMap(
      decodePDFRawStream(toUnicode).decode(),
    )
    if (unicodeToCode.size === 0) return null
    return { key, unicodeToCode }
  }

  return null
}

function encodeWithExistingFont(
  text: string,
  unicodeToCode: Map<string, string>,
): PDFHexString {
  const mappings = [...unicodeToCode.entries()].sort(
    ([left], [right]) => right.length - left.length,
  )
  let encoded = ''
  let offset = 0
  while (offset < text.length) {
    const mapping = mappings.find(([unicode]) =>
      text.startsWith(unicode, offset),
    )
    if (!mapping) {
      const character = String.fromCodePoint(text.codePointAt(offset) ?? 0)
      throw new EditorPdfError(
        `The embedded PDF font does not contain “${character}”, so no replacement was made.`,
        'unsupported',
      )
    }
    encoded += mapping[1]
    offset += mapping[0].length
  }
  return PDFHexString.of(encoded)
}

/** Rotates the given pages by a quarter turn. */
export function rotatePages(
  doc: PDFDocument,
  indices: number[],
  direction: RotationDirection,
): void {
  const step = direction === 'clockwise' ? 90 : -90
  for (const index of indices) {
    const page = doc.getPage(index)
    page.setRotation(
      degrees(normalizeRotation(page.getRotation().angle + step)),
    )
  }
}

/**
 * Replaces one extracted text run. The background patch comes from a PDF.js
 * render with text operators disabled, so images, gradients and line art stay
 * intact. Original-font edits reuse the page's existing composite-font
 * resource and ToUnicode map exactly. User-selected editor fonts are embedded
 * as subsets so their real weight and italic faces survive download.
 */
export async function replaceTextRun(
  doc: PDFDocument,
  edit: PdfTextEdit,
): Promise<void> {
  const page = doc.getPage(edit.pageIndex)
  if (!page) {
    throw new EditorPdfError(
      'The selected PDF page no longer exists.',
      'replace',
    )
  }

  let fontKey: PDFName
  let encodedText: PDFHexString | null
  let renderedWidth = Math.max(edit.renderedWidth, 0)
  if (edit.fontFamily === 'original') {
    const font = findExistingFontResource(doc, page, edit.pdfFontName)
    if (!font) {
      throw new EditorPdfError(
        'The original embedded PDF font resource could not be reused exactly, so no replacement was made.',
        'unsupported',
      )
    }
    fontKey = font.key
    encodedText = edit.text
      ? encodeWithExistingFont(edit.text, font.unicodeToCode)
      : null
  } else {
    const path = editorFontFaceFile(
      edit.fontFamily,
      edit.fontWeight,
      edit.italic,
    )
    const [{ default: fontkit }, bytes] = await Promise.all([
      import('@pdf-lib/fontkit'),
      loadEditorFont(path),
    ])
    doc.registerFontkit(fontkit)
    const embedded = await doc.embedFont(bytes, { subset: true })
    fontKey = page.node.newFontDictionary(embedded.name, embedded.ref)
    encodedText = edit.text ? embedded.encodeText(edit.text) : null
    renderedWidth =
      (embedded.widthOfTextAtSize(edit.text, edit.fontSize) +
        Math.max([...edit.text].length - 1, 0) * edit.letterSpacing) *
      edit.horizontalScale
  }

  const patch = await doc.embedPng(edit.backgroundPatch.png)
  page.drawImage(patch, {
    x: edit.backgroundPatch.x,
    y: edit.backgroundPatch.y,
    width: edit.backgroundPatch.width,
    height: edit.backgroundPatch.height,
  })

  if (!encodedText) return

  const size = Math.max(4, Math.min(edit.fontSize, 144))
  const radians = (edit.rotation * Math.PI) / 180
  const horizontalScale = Math.max(0.01, Math.min(edit.horizontalScale, 10))
  const originalAlreadyBold = /(?:bold|black|heavy|semibold)/i.test(
    edit.pdfFontName,
  )
  const originalAlreadyItalic = /(?:italic|oblique)/i.test(edit.pdfFontName)
  const syntheticBold =
    edit.fontFamily === 'original' &&
    edit.fontWeight === 700 &&
    !originalAlreadyBold
  const syntheticItalic =
    edit.fontFamily === 'original' && edit.italic && !originalAlreadyItalic
  page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFillingColor(rgb(...edit.color)),
    ...(syntheticBold
      ? [
          setStrokingColor(rgb(...edit.color)),
          setLineWidth(Math.max(size * 0.025, 0.35)),
          setTextRenderingMode(TextRenderingMode.FillAndOutline),
        ]
      : []),
    setFontAndSize(fontKey, size),
    setCharacterSpacing(edit.letterSpacing),
    setCharacterSqueeze(horizontalScale * 100),
    rotateAndSkewTextRadiansAndTranslate(
      radians,
      syntheticItalic ? (12 * Math.PI) / 180 : 0,
      0,
      edit.x,
      edit.y,
    ),
    showText(encodedText),
    endText(),
    popGraphicsState(),
  )

  if (edit.underline && renderedWidth > 0) {
    const offset = -size * 0.12
    const start = {
      x: edit.x - Math.sin(radians) * offset,
      y: edit.y + Math.cos(radians) * offset,
    }
    page.drawLine({
      start,
      end: {
        x: start.x + Math.cos(radians) * renderedWidth,
        y: start.y + Math.sin(radians) * renderedWidth,
      },
      thickness: Math.max(size * 0.055, 0.5),
      color: rgb(...edit.color),
    })
  }
}

/** Removes pages (indices may be in any order). */
export function deletePages(doc: PDFDocument, indices: number[]): void {
  const sorted = [...indices].sort((a, b) => b - a)
  for (const index of sorted) {
    doc.removePage(index)
  }
}

/** Duplicates pages, inserting each copy immediately after its original. */
export async function duplicatePages(
  doc: PDFDocument,
  indices: number[],
): Promise<void> {
  const sorted = [...indices].sort((a, b) => a - b)
  const copies = await doc.copyPages(doc, sorted)
  let offset = 0
  sorted.forEach((originalIndex, copyIndex) => {
    doc.insertPage(originalIndex + offset + 1, copies[copyIndex])
    offset += 1
  })
}

/**
 * Computes the full page order after moving `fromIndices` (in ascending
 * order) so the block occupies [toIndex, toIndex + blockLength).
 * `blockStart` is the final position of the first moved page.
 */
export function computeReorder(
  fromIndices: number[],
  toIndex: number,
  pageCount: number,
): { order: number[]; blockStart: number } {
  const selected = new Set(fromIndices)
  const remaining: number[] = []
  for (let index = 0; index < pageCount; index += 1) {
    if (!selected.has(index)) remaining.push(index)
  }
  const insertion = Math.max(0, Math.min(toIndex, remaining.length))
  return {
    order: [
      ...remaining.slice(0, insertion),
      ...fromIndices,
      ...remaining.slice(insertion),
    ],
    blockStart: insertion,
  }
}

/**
 * Computes the target block start when the selected pages move by `delta`
 * positions. The block cannot leave the document bounds.
 */
export function computeMoveToIndex(
  fromIndices: number[],
  delta: number,
  pageCount: number,
): number {
  const length = fromIndices.length
  if (length === 0) return 0
  const maxStart = pageCount - length
  const target = fromIndices[0] + delta
  return Math.max(0, Math.min(target, maxStart))
}

/** Counts the pages in a PDF and returns every page index (for inserting). */
export async function countPdfPages(
  bytes: Uint8Array,
): Promise<{ count: number; indices: number[] }> {
  const source = await loadPdf(bytes)
  const count = source.getPageCount()
  return { count, indices: Array.from({ length: count }, (_, index) => index) }
}

/** Reorders the document so pages appear in `order` (full permutation). */
export async function reorderPages(
  doc: PDFDocument,
  order: number[],
): Promise<void> {
  if (order.every((index, position) => index === position)) return
  const copies = await doc.copyPages(doc, order)
  const count = doc.getPageCount()
  for (let index = count - 1; index >= 0; index -= 1) {
    doc.removePage(index)
  }
  for (const page of copies) {
    doc.addPage(page)
  }
}

/** Inserts pages copied from another PDF at the given position. */
export async function insertPdfPages(
  doc: PDFDocument,
  sourceBytes: Uint8Array,
  sourceIndices: number[],
  atIndex: number,
): Promise<void> {
  let source: PDFDocument
  try {
    source = await loadPdf(sourceBytes)
  } catch (reason) {
    throw toEditorError(reason, 'insert')
  }
  try {
    const pages = await doc.copyPages(source, sourceIndices)
    pages.forEach((page, offset) => {
      doc.insertPage(atIndex + offset, page)
    })
  } catch (reason) {
    throw toEditorError(reason, 'insert')
  }
}

/**
 * Moves the page at `fromIndex` so it sits at `toIndex` in the same
 * document. pdf-lib has no native `movePage`, so the page is unlinked and
 * re-inserted at its new position.
 */
export function movePage(
  doc: PDFDocument,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) return
  const page = doc.getPage(fromIndex)
  doc.removePage(fromIndex)
  doc.insertPage(toIndex, page)
}

/** Embeds an image as a new page sized to its natural dimensions. */
export async function insertImagePages(
  doc: PDFDocument,
  files: File[],
  atIndex: number,
): Promise<void> {
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const png = await rasterizeToPngIfNeeded(bytes, file.type)
    let image
    let page
    try {
      if (png) {
        image = await doc.embedPng(png)
      } else {
        image = await doc.embedJpg(bytes)
      }
      page = doc.addPage([image.width, image.height])
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      })
    } catch (reason) {
      throw toEditorError(reason, 'insert')
    }
    const lastIndex = doc.getPageCount() - 1
    if (lastIndex !== atIndex) {
      movePage(doc, lastIndex, atIndex)
    }
  }
}

/** Inserts a blank page at the given position using a reference page size. */
export async function insertBlankPage(
  doc: PDFDocument,
  atIndex: number,
  size: { width: number; height: number } = A4_SIZE,
): Promise<void> {
  const page = doc.addPage([size.width, size.height])
  const lastIndex = doc.getPageCount() - 1
  if (lastIndex !== atIndex) {
    movePage(doc, lastIndex, atIndex)
  }
  page.setRotation(degrees(0))
}

/** Replaces the page at `index` with the first page of `sourceBytes`. */
export async function replacePage(
  doc: PDFDocument,
  index: number,
  sourceBytes: Uint8Array,
): Promise<void> {
  let source: PDFDocument
  try {
    source = await loadPdf(sourceBytes)
  } catch (reason) {
    throw toEditorError(reason, 'replace')
  }
  try {
    const [replacement] = await doc.copyPages(source, [0])
    doc.removePage(index)
    doc.insertPage(index, replacement)
  } catch (reason) {
    throw toEditorError(reason, 'replace')
  }
}

/** Replaces the page at `index` with a page containing the given image. */
export async function replacePageWithImage(
  doc: PDFDocument,
  index: number,
  file: File,
): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const png = await rasterizeToPngIfNeeded(bytes, file.type)
  try {
    const image = png ? await doc.embedPng(png) : await doc.embedJpg(bytes)
    const page = doc.addPage([image.width, image.height])
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    })
    const replacementIndex = doc.getPageCount() - 1
    movePage(doc, replacementIndex, index)
    doc.removePage(index + 1)
  } catch (reason) {
    throw toEditorError(reason, 'replace')
  }
}

/** Extracts the given pages into a brand new PDF. */
export async function extractPdf(
  sourceBytes: Uint8Array,
  indices: number[],
): Promise<Uint8Array> {
  let source: PDFDocument
  try {
    source = await loadPdf(sourceBytes)
  } catch (reason) {
    throw toEditorError(reason, 'extract')
  }
  try {
    const out = await PDFDocument.create()
    const pages = await out.copyPages(source, indices)
    for (const page of pages) {
      out.addPage(page)
    }
    return await out.save()
  } catch (reason) {
    throw toEditorError(reason, 'extract')
  }
}

/** Splits a PDF into one new PDF per range (1-based, inclusive). */
export async function splitPdf(
  sourceBytes: Uint8Array,
  ranges: Array<{ start: number; end: number }>,
): Promise<Uint8Array[]> {
  let source: PDFDocument
  try {
    source = await loadPdf(sourceBytes)
  } catch (reason) {
    throw toEditorError(reason, 'split')
  }
  const results: Uint8Array[] = []
  try {
    for (const range of ranges) {
      const indices: number[] = []
      for (let page = range.start; page <= range.end; page += 1) {
        indices.push(page - 1)
      }
      const out = await PDFDocument.create()
      const pages = await out.copyPages(source, indices)
      for (const page of pages) {
        out.addPage(page)
      }
      results.push(await out.save())
    }
    return results
  } catch (reason) {
    throw toEditorError(reason, 'split')
  }
}

function clampToDocument(value: number, total: number): number {
  return Math.max(1, Math.min(value, total))
}

/**
 * Normalizes the split request into non-overlapping, 1-based inclusive
 * ranges. `every` returns one range per page; `ranges` keeps the supplied
 * ranges (clamped and merged); `selection` splits the whole document so
 * every selected page becomes its own part.
 */
export function normalizeSplitRanges(
  mode: SplitMode,
  ranges: PageRange[] | undefined,
  total: number,
): Array<{ start: number; end: number }> {
  if (total <= 0) return []

  if (mode === 'every') {
    return Array.from({ length: total }, (_, index) => ({
      start: index + 1,
      end: index + 1,
    }))
  }

  if (mode === 'selection') {
    const selected = new Set(
      (ranges ?? []).map((range) => clampToDocument(range.start, total)),
    )
    if (selected.size === 0) return []
    const parts: Array<{ start: number; end: number }> = []
    let runStart = 1
    for (let page = 1; page <= total; page += 1) {
      if (selected.has(page)) {
        if (runStart < page) parts.push({ start: runStart, end: page - 1 })
        parts.push({ start: page, end: page })
        runStart = page + 1
      }
    }
    if (runStart <= total) parts.push({ start: runStart, end: total })
    return parts
  }

  const normalized = (ranges ?? [])
    .map((range) => ({
      start: clampToDocument(range.start, total),
      end: clampToDocument(range.end, total),
    }))
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start - b.start)

  const merged: Array<{ start: number; end: number }> = []
  for (const range of normalized) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

/** Combines multiple PDFs into a single document in the given order. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const bytes of files) {
    let source: PDFDocument
    try {
      source = await loadPdf(bytes)
    } catch (reason) {
      throw toEditorError(reason, 'merge')
    }
    try {
      const pages = await out.copyPages(source, source.getPageIndices())
      for (const page of pages) {
        out.addPage(page)
      }
    } catch (reason) {
      throw toEditorError(reason, 'merge')
    }
  }
  return out.save()
}

/** The page a file opens on if it is an image, else null. */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

const DIRECT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

/**
 * Converts an image to PNG bytes when pdf-lib cannot embed the format
 * directly (webp, gif, bmp, avif, svg, …). Returns null for formats that
 * pdf-lib embeds natively.
 */
async function rasterizeToPngIfNeeded(
  bytes: Uint8Array,
  mime: string,
): Promise<Uint8Array | null> {
  if (DIRECT_IMAGE_TYPES.has(mime)) return null
  if (typeof document === 'undefined') return null
  try {
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: mime }),
    )
    try {
      const image = await loadImage(url)
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(image, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    throw new EditorPdfError(
      'This image format could not be embedded in the PDF.',
      'insert',
    )
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be decoded.'))
    image.src = url
  })
}

export type { PDFPage }
