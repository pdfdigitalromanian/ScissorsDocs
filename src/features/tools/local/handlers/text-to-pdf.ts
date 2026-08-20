import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import { decodeTextBytes, sanitizeWinAnsi } from '../lib/decode'

const A4 = { width: 595.28, height: 841.89 }
const LETTER = { width: 612, height: 792 }

function pageSizeFor(pageSize: string): { width: number; height: number } {
  if (pageSize === 'letter') return LETTER
  return A4
}

function applyOrientation(
  page: { width: number; height: number },
  orientation: 'auto' | 'portrait' | 'landscape',
): { width: number; height: number } {
  if (orientation === 'landscape') {
    return page.width < page.height
      ? { width: page.height, height: page.width }
      : page
  }
  return page
}

async function readTextSource(
  files: File[],
  pasted: string,
): Promise<string> {
  if (pasted.trim()) return pasted
  if (files.length === 0) {
    throw new Error('Paste some text or choose a .txt file.')
  }
  return decodeTextBytes(await localBytes(files[0]))
}

interface ParagraphEntry {
  text: string
  /** Starts a fresh page (only true for the first paragraph after \f). */
  forcePage: boolean
}

/** Flattens paragraphs, remembering which ones follow a form-feed break. */
function splitParagraphs(source: string): ParagraphEntry[] {
  const segments = source.replace(/\r\n/g, '\n').split(/\f/)
  const entries: ParagraphEntry[] = []
  let forceNext = false
  for (const segment of segments) {
    let first = true
    for (const part of segment.split(/\n{2,}/)) {
      const text = part.trim()
      if (!text) continue
      entries.push({ text, forcePage: forceNext && first })
      first = false
    }
    forceNext = true
  }
  return entries
}

export async function textToPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options } = context

  const pageSizeId = String(options.page_size ?? 'a4')
  const orientation = String(options.orientation ?? 'portrait') as
    | 'portrait'
    | 'landscape'
  const margin = Math.min(
    Math.max(Number(options.margin ?? 48), 12),
    144,
  )
  const fontSize = Math.min(
    Math.max(Number(options.font_size ?? 12), 8),
    24,
  )
  const source = await readTextSource(files, String(options.text ?? ''))

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const baseSize = pageSizeFor(pageSizeId)
  const size = applyOrientation(baseSize, orientation)
  const width = size.width
  const height = size.height
  const usableWidth = width - margin * 2
  const lineHeight = fontSize * 1.45

  const paragraphs = splitParagraphs(source)

  let page = pdfDoc.addPage([width, height])
  let cursorY = height - margin

  function newPage() {
    page = pdfDoc.addPage([width, height])
    cursorY = height - margin
  }

  for (let index = 0; index < paragraphs.length; index++) {
    const entry = paragraphs[index]
    const hasMore = index + 1 < paragraphs.length

    if (entry.forcePage) newPage()

    const lines = wrapText(sanitizeWinAnsi(entry.text), font, fontSize, usableWidth)
    for (const line of lines) {
      if (cursorY - lineHeight < margin) newPage()
      page.drawText(line, {
        x: margin,
        y: cursorY - lineHeight,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
      cursorY -= lineHeight
    }

    // Gap between paragraphs — but never after the last one, so a file
    // that ends flush with the margin cannot create a trailing blank page.
    if (!hasMore) continue
    if (cursorY - lineHeight * 0.75 < margin) newPage()
    cursorY -= lineHeight * 0.75
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true })
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/pdf',
  })
  return {
    blob,
    filename: `text-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    summary: `${pdfDoc.getPageCount()} page${pdfDoc.getPageCount() > 1 ? 's' : ''} · ${(
      blob.size / 1024
    ).toFixed(1)} KB`,
  }
}

/** Wraps a paragraph into lines that fit the available width. */
function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const clean = text.trim()
  if (!clean) return []
  const words = clean.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}