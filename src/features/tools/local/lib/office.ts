/**
 * Minimal in-browser readers for the Office Open XML formats (DOCX, PPTX,
 * XLSX). These files are ZIP archives of XML parts; fflate decompresses the
 * archive and DOMParser parses the parts. Shared helpers for text flow and
 * wrapping used by the local Word/PPT/Excel → PDF handlers live here too.
 */
import { unzipSync, zipSync } from 'fflate'
import { PDFDocument, PDFFont, rgb, type RGB } from 'pdf-lib'
import { sanitizeWinAnsi } from './decode'

/** Decompresses an Office file into a map of part name -> bytes. */
export function readOfficeArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes)
  } catch (error) {
    throw new Error(
      'The document could not be read. It may be corrupt or not a valid Office file.',
      { cause: error },
    )
  }
}

/** Packs parts into a ZIP archive (used to build .pptx/.xlsx files). */
export function zipArchive(parts: Record<string, Uint8Array>): Uint8Array {
  return zipSync(parts, { level: 6 })
}

/** Escapes a string for use inside an XML text node. */
export function escXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Decodes a part's bytes as UTF-8 text. */
export function partText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
}

/** Parses a part's bytes as XML (returns an empty doc on hard failures). */
export function partXml(bytes: Uint8Array): Document {
  const text = partText(bytes)
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const error = doc.querySelector('parsererror')
  if (error) throw new Error(`An XML part could not be parsed: ${error.textContent}`)
  return doc
}

export const A4_SIZE = { width: 595.28, height: 841.89 }
export const LETTER_SIZE = { width: 612, height: 792 }
export const DEFAULT_MARGIN = 48

export interface TextRun {
  text: string
  size: number
  color: RGB
  bold: boolean
  italic: boolean
  underline: boolean
}

export const BASE_TEXT_STYLE: Omit<TextRun, 'text'> = {
  size: 11,
  color: rgb(0, 0, 0),
  bold: false,
  italic: false,
  underline: false,
}

/** Wraps a run into display lines that fit `maxWidth`, preserving spaces. */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export interface PdfLayout {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  italic: PDFFont
  boldItalic: PDFFont
  pageWidth: number
  pageHeight: number
  margin: number
  contentWidth: number
  page: ReturnType<PDFDocument['addPage']>
  cursorY: number
  fill: (color: RGB) => void
  drawText: (
    text: string,
    x: number,
    baselineY: number,
    size: number,
    font: PDFFont,
    color: RGB,
  ) => number
  newPage: () => void
}

/** Helper for flowing content onto A4/Letter pages with a cursor. */
export async function createPdfLayout(
  pageSize: { width: number; height: number },
  margin = DEFAULT_MARGIN,
): Promise<PdfLayout> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont('Helvetica')
  const bold = await doc.embedFont('Helvetica-Bold')
  const italic = await doc.embedFont('Helvetica-Oblique')
  const boldItalic = await doc.embedFont('Helvetica-BoldOblique')
  let currentPage = doc.addPage([pageSize.width, pageSize.height])
  let cursorY = pageSize.height - margin

  const layout: PdfLayout = {
    doc,
    font,
    bold,
    italic,
    boldItalic,
    pageWidth: pageSize.width,
    pageHeight: pageSize.height,
    margin,
    contentWidth: pageSize.width - margin * 2,
    get page() {
      return currentPage
    },
    get cursorY() {
      return cursorY
    },
    set cursorY(value) {
      cursorY = value
    },
    fill(color) {
      currentPage.drawRectangle({
        x: 0,
        y: 0,
        width: pageSize.width,
        height: pageSize.height,
        color,
      })
    },
    drawText(text, x, baselineY, size, fontToUse, color) {
      currentPage.drawText(sanitizeWinAnsi(text), {
        x,
        y: baselineY,
        size,
        font: fontToUse,
        color,
      })
      return baselineY
    },
    newPage() {
      currentPage = doc.addPage([pageSize.width, pageSize.height])
      cursorY = pageSize.height - margin
    },
  }
  return layout
}

/** Renders a run of styled text starting at (x, y) with wrapping. */
export function drawStyledText(
  layout: PdfLayout,
  run: TextRun,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 1.4,
): { nextY: number; height: number } {
  const font =
    run.bold && run.italic
      ? layout.boldItalic
      : run.bold
        ? layout.bold
        : run.italic
          ? layout.italic
          : layout.font
  const lines = wrapText(sanitizeWinAnsi(run.text), font, run.size, maxWidth)
  if (lines.length === 0) return { nextY: y, height: 0 }
  const spacing = run.size * lineHeight
  let cursor = y - spacing
  for (const line of lines) {
    layout.drawText(line, x, cursor, run.size, font, run.color)
    if (run.underline) {
      const width = font.widthOfTextAtSize(line, run.size)
      layout.page.drawLine({
        start: { x, y: cursor - 1 },
        end: { x: x + width, y: cursor - 1 },
        thickness: 0.6,
        color: run.color,
      })
    }
    cursor -= spacing
  }
  return { nextY: cursor + spacing, height: lines.length * spacing }
}

export function hexToRgb(hex: string | null | undefined): RGB | null {
  if (!hex) return null
  const value = hex.replace('#', '').trim()
  if (value.length === 3) {
    return rgb(
      parseInt(value[0] + value[0], 16) / 255,
      parseInt(value[1] + value[1], 16) / 255,
      parseInt(value[2] + value[2], 16) / 255,
    )
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  )
}

/** Standard OOXML namespaces used by the parsers. */
export const NAMESPACES: Record<string, string> = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  x: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
}

/** Emu (OOXML drawing unit) to PDF points: 914400 emu == 72 pt. */
export function emuToPt(emu: number): number {
  return emu / 12700
}