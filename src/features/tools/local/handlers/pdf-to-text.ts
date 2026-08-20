import { loadPdfDocument, extractPageText } from '../lib/pdf'
import { parsePageRanges } from '../lib/image'
import { localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'

export async function pdfToTextHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) {
    throw new Error('Choose a PDF file.')
  }

  const pagesText = String(options.pages ?? 'all')
  const pdfBytes = await localBytes(files[0])
  const loaded = await loadPdfDocument(pdfBytes)
  const { document, destroy } = loaded
  try {
    const totalPages = document.numPages
    const pages = parsePageRanges(pagesText, totalPages)
    const parts: string[] = []

    for (let index = 0; index < pages.length; index++) {
      const pageNumber = pages[index]
      const page = await document.getPage(pageNumber)
      const text = await extractPageText(page)
      parts.push(
        pages.length > 1
          ? `\n\n===== Page ${pageNumber} =====\n\n${text.trim()}`
          : text.trim(),
      )
      onProgress?.(
        Math.round(((index + 1) / pages.length) * 100),
        `Extracting page ${pageNumber}`,
      )
    }

    const text = parts.join('\n').trim() + '\n'
    const encoder = new TextEncoder()
    const bytes = encoder.encode(text)
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: 'text/plain;charset=utf-8',
    })
    const base = files[0].name.replace(/\.[^/.]+$/, '')
    return {
      blob,
      filename: `${base}.txt`,
      mimeType: 'text/plain',
      summary: `${pages.length} page${pages.length > 1 ? 's' : ''} · ${(
        blob.size / 1024
      ).toFixed(1)} KB`,
    }
  } finally {
    await destroy()
  }
}