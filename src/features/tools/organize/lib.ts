import { looksLikePdf } from '@/features/editor/engine'
import {
  canvasToBlob,
  loadPdfDocument,
  renderPageToCanvas,
} from '../local/lib/pdf'
import { formatBytes } from '../local/types'

export interface OrganizeOutput {
  filename: string
  bytes: Uint8Array
  pages: number
}

export interface PdfPreview {
  file: File
  bytes: Uint8Array
  pageCount: number
  /** One object URL per rendered page (first page only when requested). */
  urls: string[]
}

export async function readPdfBytes(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!looksLikePdf(bytes)) {
    throw new Error(`“${file.name}” is not a valid PDF file.`)
  }
  return bytes
}

export function revokePreview(preview: PdfPreview): void {
  for (const url of preview.urls) URL.revokeObjectURL(url)
}

/**
 * Loads a PDF file locally and renders its page thumbnails to object URLs.
 * `firstPageOnly` keeps just the opening page so merge can preview many
 * files without rendering every page.
 */
export async function loadPdfPreview(
  file: File,
  firstPageOnly = false,
): Promise<PdfPreview> {
  const bytes = await readPdfBytes(file)
  const loaded = await loadPdfDocument(bytes)
  const urls: string[] = []
  try {
    const pageCount = loaded.document.numPages
    const first = await loaded.document.getPage(1)
    const base = first.getViewport({ scale: 1 })
    const scale = Math.min(220 / base.width, 1.5)
    const count = firstPageOnly ? 1 : pageCount
    for (let index = 1; index <= count; index += 1) {
      const page = await loaded.document.getPage(index)
      const canvas = await renderPageToCanvas(page, scale)
      const blob = await canvasToBlob(canvas)
      urls.push(URL.createObjectURL(blob))
    }
    return { file, bytes, pageCount, urls }
  } finally {
    void loaded.destroy()
  }
}

/**
 * Re-opens generated output with the local PDF engine and verifies it is a
 * valid PDF with the expected page count. Returns the actual page count.
 */
export async function validatePdfOutput(
  bytes: Uint8Array,
  expectedPages: number,
): Promise<number> {
  const loaded = await loadPdfDocument(bytes)
  try {
    if (loaded.document.numPages !== expectedPages) {
      throw new Error(
        `The result has ${loaded.document.numPages} pages but ${expectedPages} were expected.`,
      )
    }
    return loaded.document.numPages
  } finally {
    void loaded.destroy()
  }
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/pdf',
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export { formatBytes }
