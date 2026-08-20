/**
 * Local, offline PDF comparison engine (Phase 4.8).
 *
 * Everything runs in the browser: pages are rendered with pdf.js, pixel
 * differences are computed on canvas, and text differences use a word-level
 * LCS diff. No document ever leaves the machine, which also means no fake
 * "server processing" anywhere in the flow.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { looksLikePdf } from '@/features/editor/engine'
import {
  extractPageText,
  loadPdfDocument,
  renderPageToCanvas,
} from '../local/lib/pdf'

export type CompareStatus = 'identical' | 'changed' | 'added' | 'removed' | 'moved'

export interface WordDiff {
  added: string[]
  removed: string[]
  truncated: boolean
}

export interface PageCompare {
  aIndex: number | null
  bIndex: number | null
  status: CompareStatus
  /** Fraction of changed pixels (0..1) for changed pairs, else null. */
  visualRatio: number | null
  text: WordDiff | null
  /** Boolean mask of changed pixels (1 byte per pixel). */
  mask: Uint8Array | null
  /** Per changed pixel: 1 = content only in B (added), 0 = content only in A. */
  directional: Uint8Array | null
  maskWidth: number
  maskHeight: number
}

export interface CompareSummary {
  identical: number
  changed: number
  added: number
  removed: number
  moved: number
}

export interface CompareResult {
  aName: string
  bName: string
  aPageCount: number
  bPageCount: number
  pages: PageCompare[]
  summary: CompareSummary
}

export class CompareCancelledError extends Error {
  constructor() {
    super('Comparison was cancelled.')
    this.name = 'CompareCancelledError'
  }
}

export interface CompareOptions {
  /** Polled between pages to support cancellation. */
  cancelled?: () => boolean
  onProgress?: (message: string) => void
}

const MAX_DIFF_WIDTH = 360
const PIXEL_DIFF_THRESHOLD = 0.0008
const IDENTICAL_FINGERPRINT_LENGTH = 240
const MAX_WORDS_FOR_LCS = 3000
const FINGERPRINT_HASH_LENGTH = 64

interface PageFingerprint {
  textHead: string
  imageHash: string
}

/**
 * Produces a compact signature per page: the start of its extracted text plus
 * a hash of a tiny render. Equal signatures mean "almost certainly identical".
 */
async function fingerprintPage(
  page: import('pdfjs-dist').PDFPageProxy,
): Promise<PageFingerprint> {
  const text = await extractPageText(page)
  const textHead = text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, IDENTICAL_FINGERPRINT_LENGTH)
  const scale = 48 / Math.max(page.getViewport({ scale: 1 }).width, 1)
  const canvas = await renderPageToCanvas(page, scale)
  const context = canvas.getContext('2d')
  const data = context
    ? context.getImageData(0, 0, canvas.width, canvas.height).data
    : new Uint8ClampedArray(0)
  let bucket = ''
  for (let index = 0; index < data.length; index += 64) {
    bucket += data[index].toString(16).padStart(2, '0')
    if (bucket.length >= FINGERPRINT_HASH_LENGTH) break
  }
  return { textHead, imageHash: bucket }
}

function extractWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean).map((word) => word.trim())
}

/** Word-level diff. Falls back to a set-based summary on very long pages. */
export function diffWords(aText: string, bText: string): WordDiff {
  const aWords = extractWords(aText)
  const bWords = extractWords(bText)
  if (aWords.length > MAX_WORDS_FOR_LCS || bWords.length > MAX_WORDS_FOR_LCS) {
    const aSet = new Set(aWords)
    const bSet = new Set(bWords)
    const removed = aWords.filter((word) => !bSet.has(word))
    const added = bWords.filter((word) => !aSet.has(word))
    return { added, removed, truncated: true }
  }
  const previous: number[][] = Array.from({ length: aWords.length + 1 }, () =>
    new Array<number>(bWords.length + 1).fill(0),
  )
  for (let i = aWords.length - 1; i >= 0; i -= 1) {
    for (let j = bWords.length - 1; j >= 0; j -= 1) {
      previous[i][j] =
        aWords[i] === bWords[j]
          ? previous[i + 1][j + 1] + 1
          : Math.max(previous[i + 1][j], previous[i][j + 1])
    }
  }
  const added: string[] = []
  const removed: string[] = []
  let i = 0
  let j = 0
  while (i < aWords.length && j < bWords.length) {
    if (aWords[i] === bWords[j]) {
      i += 1
      j += 1
    } else if (previous[i + 1][j] >= previous[i][j + 1]) {
      removed.push(aWords[i])
      i += 1
    } else {
      added.push(bWords[j])
      j += 1
    }
  }
  while (i < aWords.length) removed.push(aWords[i++])
  while (j < bWords.length) added.push(bWords[j++])
  return { added, removed, truncated: false }
}

/** Computes a pixel difference between two renders at a bounded resolution. */
function pixelDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): {
  ratio: number
  mask: Uint8Array
  directional: Uint8Array
  width: number
  height: number
} {
  const targetWidth = Math.min(MAX_DIFF_WIDTH, Math.max(a.width, b.width))
  const scaleA = targetWidth / a.width
  const scaleB = targetWidth / b.width
  const width = targetWidth
  const height = Math.max(Math.floor(a.height * scaleA), Math.floor(b.height * scaleB))

  function downscale(canvas: HTMLCanvasElement, scale: number): ImageData {
    const out = document.createElement('canvas')
    out.width = width
    out.height = Math.floor(canvas.height * scale)
    const context = out.getContext('2d')
    if (!context) throw new Error('Canvas 2D rendering is not available.')
    context.imageSmoothingEnabled = true
    context.drawImage(canvas, 0, 0, out.width, out.height)
    return context.getImageData(0, 0, out.width, out.height)
  }

  const aData = downscale(a, scaleA)
  const bData = downscale(b, scaleB)
  const mask = new Uint8Array(width * height)
  const directional = new Uint8Array(width * height)
  let changed = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const aIndex = (y * aData.width + x) * 4
      const bIndex = (y * bData.width + x) * 4
      const ar = aData.data[aIndex]
      const ag = aData.data[aIndex + 1]
      const ab = aData.data[aIndex + 2]
      const br = bData.data[bIndex]
      const bg = bData.data[bIndex + 1]
      const bb = bData.data[bIndex + 2]
      const delta =
        Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)
      if (delta > 90) {
        const maskIndex = y * width + x
        mask[maskIndex] = 1
        changed += 1
        directional[maskIndex] =
          ar + ag + ab > br + bg + bb ? 0 : 1
      }
    }
  }
  return {
    ratio: changed / (width * height),
    mask,
    directional,
    width,
    height,
  }
}

async function renderPageAtFixedWidth(
  page: import('pdfjs-dist').PDFPageProxy,
  targetWidth: number,
): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 })
  return renderPageToCanvas(page, targetWidth / base.width)
}

async function comparePair(
  aPage: import('pdfjs-dist').PDFPageProxy,
  bPage: import('pdfjs-dist').PDFPageProxy,
  aIndex: number,
  bIndex: number,
): Promise<PageCompare> {
  const base: PageCompare = {
    aIndex,
    bIndex,
    status: 'changed',
    visualRatio: null,
    text: null,
    mask: null,
    directional: null,
    maskWidth: 0,
    maskHeight: 0,
  }
  const aText = await extractPageText(aPage)
  const bText = await extractPageText(bPage)
  base.text = diffWords(aText, bText)

  const aCanvas = await renderPageAtFixedWidth(aPage, MAX_DIFF_WIDTH)
  const bCanvas = await renderPageAtFixedWidth(bPage, MAX_DIFF_WIDTH)
  const diff = pixelDiff(aCanvas, bCanvas)
  base.visualRatio = diff.ratio
  base.mask = diff.mask
  base.directional = diff.directional
  base.maskWidth = diff.width
  base.maskHeight = diff.height
  if (
    base.visualRatio < PIXEL_DIFF_THRESHOLD &&
    base.text.added.length === 0 &&
    base.text.removed.length === 0
  ) {
    base.status = 'identical'
  }
  return base
}

function matchingPages(
  aFp: PageFingerprint[],
  bFp: PageFingerprint[],
): Array<{ a: number; b: number; equal: boolean }> {
  const min = Math.min(aFp.length, bFp.length)
  const pairs: Array<{ a: number; b: number; equal: boolean }> = []
  const claimedA = new Set<number>()
  const claimedB = new Set<number>()

  for (let index = 0; index < min; index += 1) {
    const equal =
      aFp[index].textHead === bFp[index].textHead &&
      aFp[index].imageHash === bFp[index].imageHash
    if (equal) {
      claimedA.add(index)
      claimedB.add(index)
      pairs.push({ a: index, b: index, equal: true })
    }
  }

  for (let aIndex = 0; aIndex < aFp.length; aIndex += 1) {
    if (claimedA.has(aIndex)) continue
    for (let bIndex = 0; bIndex < bFp.length; bIndex += 1) {
      if (claimedB.has(bIndex)) continue
      if (
        aFp[aIndex].textHead === bFp[bIndex].textHead &&
        aFp[aIndex].imageHash === bFp[bIndex].imageHash
      ) {
        claimedA.add(aIndex)
        claimedB.add(bIndex)
        pairs.push({ a: aIndex, b: bIndex, equal: false })
        break
      }
    }
  }

  for (let index = 0; index < min; index += 1) {
    if (claimedA.has(index) || claimedB.has(index)) continue
    claimedA.add(index)
    claimedB.add(index)
    pairs.push({ a: index, b: index, equal: false })
  }

  const onlyA: number[] = []
  const onlyB: number[] = []
  for (let index = 0; index < aFp.length; index += 1) {
    if (!claimedA.has(index)) onlyA.push(index)
  }
  for (let index = 0; index < bFp.length; index += 1) {
    if (!claimedB.has(index)) onlyB.push(index)
  }
  return pairs.concat(
    onlyA.map((index) => ({ a: index, b: -1, equal: false })),
    onlyB.map((index) => ({ a: -1, b: index, equal: false })),
  )
}

/** Compares two PDF byte streams and reports per-page differences. */
export async function comparePdfBytes(
  aBytes: Uint8Array,
  bBytes: Uint8Array,
  aName: string,
  bName: string,
  options: CompareOptions = {},
): Promise<CompareResult> {
  if (!looksLikePdf(aBytes) || !looksLikePdf(bBytes)) {
    throw new Error('Both files must be valid PDF documents.')
  }
  const a = await loadPdfDocument(aBytes)
  const b = await loadPdfDocument(bBytes)
  try {
    const aCount = a.document.numPages
    const bCount = b.document.numPages
    if (aCount === 0 || bCount === 0) {
      throw new Error('One of the documents has no pages.')
    }

    options.onProgress?.('Analysing Version A…')
    const aFp: PageFingerprint[] = []
    for (let index = 1; index <= aCount; index += 1) {
      if (options.cancelled?.()) throw new CompareCancelledError()
      aFp.push(await fingerprintPage(await a.document.getPage(index)))
      options.onProgress?.(`Analysing Version A… page ${index} of ${aCount}`)
    }

    options.onProgress?.('Analysing Version B…')
    const bFp: PageFingerprint[] = []
    for (let index = 1; index <= bCount; index += 1) {
      if (options.cancelled?.()) throw new CompareCancelledError()
      bFp.push(await fingerprintPage(await b.document.getPage(index)))
      options.onProgress?.(`Analysing Version B… page ${index} of ${bCount}`)
    }

    const pairs = matchingPages(aFp, bFp)
    const pages: PageCompare[] = []
    for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
      if (options.cancelled?.()) throw new CompareCancelledError()
      const pair = pairs[pairIndex]
      if (pair.b === -1) {
        pages.push({
          aIndex: pair.a,
          bIndex: null,
          status: 'removed',
          visualRatio: null,
          text: null,
          mask: null,
          directional: null,
          maskWidth: 0,
          maskHeight: 0,
        })
        continue
      }
      if (pair.a === -1) {
        pages.push({
          aIndex: null,
          bIndex: pair.b,
          status: 'added',
          visualRatio: null,
          text: null,
          mask: null,
          directional: null,
          maskWidth: 0,
          maskHeight: 0,
        })
        continue
      }
      if (pair.equal) {
        pages.push({
          aIndex: pair.a,
          bIndex: pair.b,
          status: 'identical',
          visualRatio: 0,
          text: { added: [], removed: [], truncated: false },
          mask: null,
          directional: null,
          maskWidth: 0,
          maskHeight: 0,
        })
        continue
      }
      const aPage = await a.document.getPage(pair.a + 1)
      const bPage = await b.document.getPage(pair.b + 1)
      options.onProgress?.(
        `Comparing page ${pair.b + 1} of ${bCount}…`,
      )
      const compare = await comparePair(aPage, bPage, pair.a, pair.b)
      if (
        compare.status === 'identical' &&
        pair.a !== pair.b
      ) {
        compare.status = 'moved'
      }
      pages.push(compare)
    }

    const summary: CompareSummary = {
      identical: 0,
      changed: 0,
      added: 0,
      removed: 0,
      moved: 0,
    }
    for (const page of pages) summary[page.status] += 1

    return {
      aName,
      bName,
      aPageCount: aCount,
      bPageCount: bCount,
      pages,
      summary,
    }
  } finally {
    void a.destroy()
    void b.destroy()
  }
}

const REPORT_WORD_LIMIT = 40

function wrapReportText(
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Builds a plain, text-based comparison report PDF (difference summary with
 * page references and word-level changes). No screenshot hacks — the report
 * is a genuine structured document.
 */
export async function buildCompareReport(
  result: CompareResult,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let current = doc.addPage()
  const { width, height } = current.getSize()
  const margin = 54
  const contentWidth = width - margin * 2
  const leading = 15

  let cursorY = height - margin
  const ensureSpace = (needed: number) => {
    if (cursorY - needed < margin) {
      current = doc.addPage()
      cursorY = height - margin
    }
  }
  const drawText = (
    text: string,
    size: number,
    options: { bold?: boolean; color?: [number, number, number] } = {},
  ) => {
    const face = options.bold ? bold : font
    const color = options.color ?? [0.15, 0.17, 0.2]
    const lines = wrapReportText(face, text, size, contentWidth)
    for (const line of lines) {
      ensureSpace(leading)
      current.drawText(line, {
        x: margin,
        y: cursorY - leading,
        size,
        font: face,
        color: rgb(color[0], color[1], color[2]),
      })
      cursorY -= leading
    }
  }

  drawText('PDF comparison report', 22, { bold: true })
  drawText(`${result.aName}  vs  ${result.bName}`, 12)
  drawText(
    `Version A: ${result.aPageCount} pages · Version B: ${result.bPageCount} pages`,
    11,
  )
  drawText('', 11)
  drawText(
    `Summary — ${result.summary.identical} unchanged, ${result.summary.changed} changed, ${result.summary.moved} moved, ${result.summary.added} added, ${result.summary.removed} removed.`,
    11,
  )
  drawText('', 11)

  for (const page of result.pages) {
    const refA = page.aIndex === null ? '—' : `${page.aIndex + 1}`
    const refB = page.bIndex === null ? '—' : `${page.bIndex + 1}`
    drawText(
      `Page B${refB} (A${refA}) — ${page.status.toUpperCase()}`,
      11,
      { bold: true, color: page.status === 'changed' ? [0.65, 0.35, 0.05] : page.status === 'added' ? [0.1, 0.5, 0.15] : page.status === 'removed' ? [0.65, 0.1, 0.1] : [0.2, 0.3, 0.4] },
    )
    if (page.visualRatio !== null) {
      drawText(
        `  Visual difference: ${(page.visualRatio * 100).toFixed(2)}% of the page changed.`,
        10,
      )
    }
    if (page.text) {
      const added = page.text.added.slice(0, REPORT_WORD_LIMIT).join(' ')
      const removed = page.text.removed.slice(0, REPORT_WORD_LIMIT).join(' ')
      if (added) drawText(`  Added: ${added}${page.text.added.length > REPORT_WORD_LIMIT ? ' …' : ''}`, 10)
      if (removed) drawText(`  Removed: ${removed}${page.text.removed.length > REPORT_WORD_LIMIT ? ' …' : ''}`, 10)
      if (!added && !removed) drawText('  No text-level changes detected.', 10)
    }
  }

  return doc.save()
}