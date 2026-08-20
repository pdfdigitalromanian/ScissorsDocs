/**
 * Shared front-end engine for OCR.
 *
 * OCR runs entirely in the browser using Tesseract.js — no Python server and
 * no system Tesseract binary required. This module owns everything around it:
 * detecting which pages actually need OCR, rendering those pages to raster
 * images, recognizing the text, building a searchable PDF page (the scanned
 * image plus an invisible, selectable text layer), and merging the result
 * back into the original document in the right order. That keeps page
 * selection real and the whole document private.
 */
import { PDFDocument, rgb, StandardFonts, setTextRenderingMode, TextRenderingMode } from 'pdf-lib'
import { createWorker, type Worker as OcrWorker } from 'tesseract.js'
import { looksLikePdf, loadPdf, extractPdf } from '@/features/editor/engine'
import { loadPdfDocument, renderPageToCanvas, canvasToBlob } from '../local/lib/pdf'

export interface OcrPageInfo {
  index: number
  chars: number
  /** True when the page carries almost no selectable text (image/scan). */
  scanned: boolean
}

export const OCR_TEXT_THRESHOLD = 20

export const OCR_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'rus', label: 'Russian' },
  { code: 'ara', label: 'Arabic' },
  { code: 'hin', label: 'Hindi' },
  { code: 'chi_sim', label: 'Chinese (simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
]

/** OCR always runs locally in this build. */
export function isOcrAvailable(): Promise<boolean> {
  return Promise.resolve(true)
}

/**
 * Inspects every page with pdf.js and reports how much selectable text it
 * carries. Pages with almost no text are flagged as scanned/image-based and
 * are the ones that genuinely benefit from OCR.
 */
export async function detectPagesToOcr(
  bytes: Uint8Array,
): Promise<OcrPageInfo[]> {
  const loaded = await loadPdfDocument(bytes)
  try {
    const count = loaded.document.numPages
    const pages: OcrPageInfo[] = []
    for (let index = 1; index <= count; index += 1) {
      const page = await loaded.document.getPage(index)
      const content = await page.getTextContent()
      const chars = content.items.reduce<number>(
        (sum, item) => sum + ('str' in item ? item.str.length : 0),
        0,
      )
      pages.push({
        index: index - 1,
        chars,
        scanned: chars < OCR_TEXT_THRESHOLD,
      })
    }
    return pages
  } finally {
    void loaded.destroy()
  }
}

/** Extracts a subset of pages into a fresh PDF (0-based indices). */
export async function extractPages(
  bytes: Uint8Array,
  indices: number[],
): Promise<Uint8Array> {
  return extractPdf(bytes, indices)
}

/**
 * Rebuilds the original document so selected pages are replaced by their OCR
 * counterpart while unselected pages stay exactly as they were. `ocrBytes`
 * must contain one page per entry in `selectedIndices`, in the same order.
 */
export async function mergeOcrResult(
  sourceBytes: Uint8Array,
  ocrBytes: Uint8Array,
  selectedIndices: number[],
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const source = await loadPdf(sourceBytes)
  const ocr = await PDFDocument.load(ocrBytes)
  const ocrCount = ocr.getPageCount()
  if (ocrCount !== selectedIndices.length) {
    throw new Error(
      `OCR produced ${ocrCount} pages but ${selectedIndices.length} were expected.`,
    )
  }

  const selected = new Set(selectedIndices)
  const sourceCount = source.getPageCount()

  const out = await PDFDocument.create()
  const ocrPageRefs = await out.copyPages(ocr, ocr.getPageIndices())
  let ocrCursor = 0
  for (let pageIndex = 0; pageIndex < sourceCount; pageIndex += 1) {
    if (selected.has(pageIndex)) {
      out.addPage(ocrPageRefs[ocrCursor])
      ocrCursor += 1
    } else {
      const [copied] = await out.copyPages(source, [pageIndex])
      out.addPage(copied)
    }
  }

  const bytes = await out.save({ useObjectStreams: true })
  const reopened = await PDFDocument.load(bytes)
  if (reopened.getPageCount() !== sourceCount) {
    throw new Error('The merged OCR result has the wrong number of pages.')
  }
  return { bytes, pageCount: reopened.getPageCount() }
}

interface OcrWord {
  text: string
  x: number
  y: number
  width: number
  height: number
}

interface OcrPageResult {
  words: OcrWord[]
}

/**
 * Runs Tesseract.js on a single rendered page canvas and returns the
 * recognized words in PDF-point coordinates (bottom-left origin).
 */
async function recognizePage(
  worker: OcrWorker,
  canvas: HTMLCanvasElement,
  pageWidthPts: number,
  pageHeightPts: number,
): Promise<OcrPageResult> {
  const { data } = await worker.recognize(canvas)
  const words: OcrWord[] = []
  const pageWords = (data.blocks ?? []).flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) =>
      (paragraph.lines ?? []).flatMap((line) => line.words ?? []),
    ),
  )
  for (const word of pageWords) {
    const text = (word.text ?? '').trim()
    const bbox = word.bbox
    if (!text || !bbox) continue
    if (typeof word.confidence === 'number' && word.confidence < 35) continue
    const x0 = bbox.x0 ?? 0
    const y0 = bbox.y0 ?? 0
    const x1 = bbox.x1 ?? 0
    const y1 = bbox.y1 ?? 0
    if (x1 <= x0 || y1 <= y0) continue
    words.push({
      text,
      x: (x0 / canvas.width) * pageWidthPts,
      // Tesseract's bbox origin is top-left; PDFs are bottom-left.
      y: pageHeightPts - (y1 / canvas.height) * pageHeightPts,
      width: ((x1 - x0) / canvas.width) * pageWidthPts,
      height: ((y1 - y0) / canvas.height) * pageHeightPts,
    })
  }
  return { words }
}

/**
 * Builds a searchable PDF page: the rendered scan as a full-page image plus a
 * transparent, selectable text layer laid out at each recognized word's box.
 */
async function buildSearchablePdf(
  pages: Array<{ canvas: HTMLCanvasElement; widthPts: number; heightPts: number; words: OcrWord[] }>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const page of pages) {
    const blob = await canvasToBlob(page.canvas, 'image/png')
    const imageBytes = new Uint8Array(await blob.arrayBuffer())
    const image = await pdfDoc.embedPng(imageBytes)
    const pdfPage = pdfDoc.addPage([page.widthPts, page.heightPts])
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: page.widthPts,
      height: page.heightPts,
    })
    // The recognized words are drawn as an invisible text layer (rendering
    // mode 3), so the page stays searchable and selectable but nothing is
    // painted over the scan.
    pdfPage.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible))
    for (const word of page.words) {
      const size = Math.max(4, Math.min(72, word.height))
      pdfPage.drawText(word.text, {
        x: word.x,
        y: word.y - size * 0.8,
        size,
        font,
        color: rgb(0, 0, 0),
      })
    }
    pdfPage.pushOperators(setTextRenderingMode(TextRenderingMode.Fill))
  }

  return pdfDoc.save({ useObjectStreams: true })
}

/**
 * Runs OCR for the selected pages entirely in the browser. Selected pages are
 * rendered at the requested DPI, recognized with Tesseract.js, and turned
 * into searchable PDF pages that are merged back into the document in order.
 */
export async function runOcr(
  sourceBytes: Uint8Array,
  _sourceName: string,
  selectedIndices: number[],
  options: { dpi: number; language: string },
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const loaded = await loadPdfDocument(sourceBytes)
  const worker = await createWorker(options.language || 'eng', 1)
  try {
    const { document } = loaded
    const scale = Math.max(1, options.dpi / 72)
    const pages: Array<{ canvas: HTMLCanvasElement; widthPts: number; heightPts: number; words: OcrWord[] }> = []

    for (let cursor = 0; cursor < selectedIndices.length; cursor += 1) {
      const pageIndex = selectedIndices[cursor]
      const page = await document.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: 1 })
      const canvas = await renderPageToCanvas(page, scale)
      const recognized = await recognizePage(
        worker,
        canvas,
        viewport.width,
        viewport.height,
      )
      pages.push({
        canvas,
        widthPts: viewport.width,
        heightPts: viewport.height,
        words: recognized.words,
      })
    }

    const ocrBytes = await buildSearchablePdf(pages)
    if (!looksLikePdf(ocrBytes)) {
      throw new Error('OCR did not produce a valid PDF.')
    }
    if (selectedIndices.length === 1) {
      return { bytes: ocrBytes, pageCount: 1 }
    }
    return mergeOcrResult(sourceBytes, ocrBytes, selectedIndices)
  } finally {
    await worker.terminate()
    await loaded.destroy()
  }
}