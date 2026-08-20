import { loadPdfDocument, renderPageToBlob } from '../lib/pdf'
import { parsePageRanges } from '../lib/image'
import { makeZipBlob } from '../lib/zip'
import { LocalToolError, localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'

export async function pdfToImagesHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) {
    throw new Error('Choose a PDF file.')
  }

  const dpi = Number(options.dpi ?? 150)
  const format = String(options.format ?? 'png') as 'png' | 'jpg'
  const quality = Number(options.quality ?? 85) / 100
  const pagesText = String(options.pages ?? 'all')

  const pdfBytes = await localBytes(files[0])
  const loaded = await loadPdfDocument(pdfBytes)
  const { document, destroy } = loaded
  try {
    const totalPages = document.numPages
    const pages = parsePageRanges(pagesText, totalPages)
    if (pages.length === 0) {
      throw new LocalToolError('No valid pages were selected.')
    }

    const scale = dpi / 72
    const rendered: { name: string; blob: Blob }[] = []
    for (let index = 0; index < pages.length; index++) {
      const pageNumber = pages[index]
      const page = await document.getPage(pageNumber)
      const { blob } = await renderPageToBlob(page, scale, format, quality)
      const extension = format === 'png' ? 'png' : 'jpg'
      rendered.push({
        name: `${baseName(files[0].name)}-page-${pageNumber}.${extension}`,
        blob,
      })
      onProgress?.(
        Math.round(((index + 1) / pages.length) * 100),
        `Rendering page ${pageNumber}`,
      )
    }

    if (rendered.length === 1) {
      const single = rendered[0]
      return {
        blob: single.blob,
        filename: single.name,
        mimeType: single.blob.type,
        summary: `1 page · ${(single.blob.size / 1024).toFixed(1)} KB`,
      }
    }

    const entries = await Promise.all(
      rendered.map(async (item) => ({
        name: item.name,
        data: await localBytes(item.blob),
      })),
    )
    const zip = makeZipBlob(entries)
    return {
      blob: zip,
      filename: `${baseName(files[0].name)}-pages.zip`,
      mimeType: 'application/zip',
      summary: `${rendered.length} pages · ${(zip.size / 1024).toFixed(1)} KB`,
    }
  } finally {
    await destroy()
  }
}

function baseName(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '')
  return withoutExt.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 60)
}