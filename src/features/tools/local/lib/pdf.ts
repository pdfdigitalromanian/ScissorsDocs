import { pdfjs } from '@/features/pdf/pdfjs'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist'

export interface LoadedPdf {
  document: PDFDocumentProxy
  destroy: () => Promise<void>
}

/**
 * Loads a PDF from raw bytes for local, offline processing. A defensive
 * copy is made because pdf.js transfers the buffer to its worker thread.
 */
export async function loadPdfDocument(
  bytes: Uint8Array,
): Promise<LoadedPdf> {
  const loadingTask: PDFDocumentLoadingTask = pdfjs.getDocument({
    data: bytes.slice(),
  })
  const document = await loadingTask.promise
  return { document, destroy: () => loadingTask.destroy() }
}

/** Renders a page to an offscreen canvas at the given scale. */
export async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.')
  }
  await page.render({ canvas, viewport }).promise
  return canvas
}

export interface RenderedPageBlob {
  blob: Blob
  width: number
  height: number
}

/** Renders a page and encodes it as a PNG or JPEG blob. */
export async function renderPageToBlob(
  page: PDFPageProxy,
  scale: number,
  format: 'png' | 'jpg',
  quality = 0.85,
): Promise<RenderedPageBlob> {
  const canvas = await renderPageToCanvas(page, scale)
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, mimeType, quality)
  return { blob, width: canvas.width, height: canvas.height }
}

/** Encodes a canvas to a blob via toBlob (falling back to toDataURL). */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('The canvas could not be encoded to an image.'))
        }
      },
      type,
      quality,
    )
  })
}

/**
 * Extracts readable text from a page in reading order. Items are clustered
 * into lines by their baseline (y) and then sorted left-to-right by x.
 */
export async function extractPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent()
  const rows: { y: number; x: number; text: string }[] = []
  for (const item of content.items) {
    if (!('str' in item) || !('transform' in item)) continue
    const transform = item.transform as number[]
    const width = Math.hypot(transform[0], transform[1])
    rows.push({
      y: transform[5],
      x: Math.min(transform[4], transform[4] + width),
      text: item.str,
    })
  }
  rows.sort((left, right) => {
    const yDelta = right.y - left.y
    if (Math.abs(yDelta) > 1) return yDelta
    return left.x - right.x
  })
  const lines: string[] = []
  let lastY: number | null = null
  for (const row of rows) {
    if (lastY !== null && Math.abs(row.y - lastY) > 1) lines.push('')
    if (lines.length === 0 || lines[lines.length - 1] === '') {
      lines.push(row.text)
    } else {
      lines[lines.length - 1] += row.text
    }
    lastY = row.y
  }
  return lines.join('\n').replace(/\n\n+/g, '\n\n')
}