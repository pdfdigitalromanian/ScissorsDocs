import { rgb } from 'pdf-lib'
import { localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import {
  A4_SIZE,
  LETTER_SIZE,
  NAMESPACES,
  createPdfLayout,
  drawStyledText,
  hexToRgb,
  partText,
  partXml,
  readOfficeArchive,
  wrapText,
  type TextRun,
} from '../lib/office'

const W = NAMESPACES.w

/**
 * Local Word (.docx) → PDF conversion. The .docx ZIP is opened with fflate,
 * `word/document.xml` is parsed, and paragraphs/tables are flowed onto A4 or
 * Letter pages with pdf-lib. Bold/italic/underline, heading sizes, list
 * bullets, and simple tables are honoured so the output reads like the
 * original document rather than a raw dump.
 */

function childByTag(node: Element, tag: string): Element | null {
  return Array.from(node.children).find(
    (child) => child.localName === tag && child.namespaceURI === W,
  ) ?? null
}

function childrenByTag(node: Element, tag: string): Element[] {
  return Array.from(node.children).filter(
    (child) => child.localName === tag && child.namespaceURI === W,
  )
}

function runProps(run: Element): { bold: boolean; italic: boolean; underline: boolean } {
  const rPr = childByTag(run, 'rPr')
  if (!rPr) return { bold: false, italic: false, underline: false }
  return {
    bold: Boolean(childByTag(rPr, 'b')),
    italic: Boolean(childByTag(rPr, 'i')),
    underline: Boolean(childByTag(rPr, 'u')),
  }
}

/** Collects the plain text of a run's <w:t> descendants. */
function runText(run: Element): string {
  let text = ''
  for (const node of Array.from(run.querySelectorAll(':scope > w\\:t, :scope > w\\:tab'))) {
    const el = node as Element
    if (el.localName === 'tab') text += '    '
    else text += el.textContent ?? ''
  }
  // Some writers use `w:t` directly without the namespace prefix wrapper.
  if (!text) {
    for (const t of Array.from(run.querySelectorAll('t'))) {
      text += t.textContent ?? ''
    }
  }
  return text.replace(/\u00a0/g, ' ')
}

function paragraphRuns(paragraph: Element): TextRun[] {
  const runs: TextRun[] = []
  for (const run of childrenByTag(paragraph, 'r')) {
    const style = runProps(run)
    const text = runText(run)
    if (!text.trim()) continue
    const rPr = childByTag(run, 'rPr')
    const sz = childByTag(rPr ?? paragraph, 'sz')
    const sizeHalfPoints = sz?.getAttribute('w:val')
      ? Number(sz.getAttribute('w:val'))
      : 22
    const colorNode = rPr?.querySelector('w\\:color')
    runs.push({
      text,
      size: sizeHalfPoints / 2,
      color: hexToRgb(colorNode?.getAttribute('w:val') ?? null) ?? rgb(0, 0, 0),
      ...style,
    })
  }
  return runs
}

function headingLevel(paragraph: Element): number | null {
  const pStyle = childByTag(paragraph, 'pStyle')
  if (!pStyle) return null
  const style = pStyle.getAttribute('w:val') ?? ''
  const match = style.match(/heading\s*([1-6])/i) || style.match(/[hH]([1-6])$/)
  if (match) return Number(match[1])
  if (/title/i.test(style)) return 0
  return null
}

function paragraphIsList(paragraph: Element): boolean {
  const pPr = childByTag(paragraph, 'pPr')
  const numPr = pPr ? childByTag(pPr, 'numPr') : null
  const ind = pPr ? childByTag(pPr, 'ind') : null
  return Boolean(numPr) || Boolean(ind)
}

function tableRows(table: Element): Element[] {
  return Array.from(table.children).filter(
    (child) => child.localName === 'tr' && child.namespaceURI === W,
  )
}

function cellText(cell: Element): string[] {
  const lines: string[] = []
  for (const paragraph of childrenByTag(cell, 'p')) {
    const text = paragraphRuns(paragraph).map((run) => run.text).join('').trim()
    if (text) lines.push(text)
  }
  return lines
}

export async function wordToPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) throw new Error('Choose a .docx file to convert.')

  const source = files.find((file) =>
    /\.docx$/i.test(file.name),
  ) ?? files[0]
  const bytes = await localBytes(source)
  const archive = readOfficeArchive(bytes)
  const documentXml = archive['word/document.xml']
  if (!documentXml) {
    throw new Error('The .docx file does not contain a document.xml part.')
  }
  const doc = partXml(documentXml)

  const pageSize = String(options.page_size ?? 'a4').toLowerCase() === 'letter'
    ? LETTER_SIZE
    : A4_SIZE
  const layout = await createPdfLayout(pageSize, 54)
  const body = Array.from(doc.documentElement.children).find(
    (child) => child.localName === 'body' && child.namespaceURI === W,
  )
  const children = body ? Array.from(body.children) : []

  let blockIndex = 0
  const total = children.length

  function advance(height: number): void {
    if (layout.cursorY - height < layout.margin) layout.newPage()
  }

  function drawParagraphRuns(runs: TextRun[], baseSize: number, leftInset: number): void {
    const maxWidth = layout.contentWidth - leftInset
    for (const run of runs) {
      const size = Math.max(6, baseSize > 0 ? baseSize : run.size)
      const result = drawStyledText(
        layout,
        { ...run, size },
        layout.margin + leftInset,
        layout.cursorY,
        maxWidth,
      )
      layout.cursorY = result.nextY
    }
  }

  for (const node of children) {
    onProgress?.(
      Math.round(((blockIndex + 1) / total) * 100),
      `Laying out block ${blockIndex + 1} of ${total}`,
    )
    blockIndex += 1
    const tag = node.localName

    if (tag === 'p') {
      const runs = paragraphRuns(node as Element)
      if (runs.length === 0) {
        layout.cursorY -= 12
        continue
      }
      const level = headingLevel(node as Element)
      const isList = paragraphIsList(node as Element)
      const size = level !== null
        ? level === 0
          ? 20
          : 16 - level * 1.5
        : 11
      const leading = level !== null ? 16 : 6
      layout.cursorY -= leading
      const runsStyled = runs.map((run) => {
        if (level === null) return run
        // Word's default heading colour is blue, not black; apply it when the
        // run does not carry its own colour so headings read like the original.
        const isDefaultBlack =
          run.color.red === 0 && run.color.green === 0 && run.color.blue === 0
        return {
          ...run,
          bold: true,
          size,
          color: isDefaultBlack ? rgb(47 / 255, 84 / 255, 150 / 255) : run.color,
        }
      })
      drawParagraphRuns(runsStyled, size, isList ? 18 : 0)
      layout.cursorY -= level !== null ? 12 : 8
      continue
    }

    if (tag === 'tbl') {
      const rows = tableRows(node as Element)
      if (rows.length === 0) continue
      const columns = Math.max(
        1,
        ...rows.map(
          (row) =>
            Array.from(row.children).filter(
              (child) => child.localName === 'tc' && child.namespaceURI === W,
            ).length,
        ),
      )
      const columnWidth = layout.contentWidth / columns
      const lineHeight = 13
      const cellFontSize = 9
      // Wrap each cell's text to its column and measure the row height from
      // the real wrapped line count so text never spills out of the cell.
      const wrappedCells: string[][][] = rows.map((row) =>
        Array.from(row.children)
          .filter(
            (child) => child.localName === 'tc' && child.namespaceURI === W,
          )
          .map((cell) =>
            cellText(cell).flatMap((line) =>
              wrapText(line, layout.font, cellFontSize, columnWidth - 8),
            ),
          ),
      )
      const rowHeights = wrappedCells.map((cells) => {
        const maxLines = Math.max(1, ...cells.map((lines) => lines.length))
        return Math.max(20, maxLines * lineHeight + 8)
      })
      const tableHeight = rowHeights.reduce((sum, h) => sum + h, 0)
      advance(tableHeight + 12)
      layout.cursorY -= 8
      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.children).filter(
          (child) => child.localName === 'tc' && child.namespaceURI === W,
        )
        for (let colIndex = 0; colIndex < cells.length; colIndex += 1) {
          const x = layout.margin + colIndex * columnWidth
          const y = layout.cursorY - rowHeights[rowIndex]
          layout.page.drawRectangle({
            x,
            y,
            width: columnWidth,
            height: rowHeights[rowIndex],
            borderColor: rgb(0.6, 0.6, 0.6),
            borderWidth: 0.5,
          })
          const cellLines = wrappedCells[rowIndex][colIndex] ?? []
          let textY = y + rowHeights[rowIndex] - 6
          for (const line of cellLines) {
            layout.drawText(
              line,
              x + 4,
              textY - 4,
              cellFontSize,
              layout.font,
              rgb(0, 0, 0),
            )
            textY -= lineHeight
          }
        }
        layout.cursorY -= rowHeights[rowIndex]
      })
      layout.cursorY -= 10
      continue
    }

    // Any other block (sectPr, etc.) — ignore.
  }

  const outBytes = await layout.doc.save({ useObjectStreams: true })
  const blob = new Blob([outBytes as unknown as BlobPart], {
    type: 'application/pdf',
  })
  const baseName = source.name.replace(/\.docx$/i, '') || 'document'
  return {
    blob,
    filename: `${baseName}.pdf`,
    mimeType: 'application/pdf',
    summary: `${layout.doc.getPageCount()} page${layout.doc.getPageCount() > 1 ? 's' : ''} · ${(
      blob.size / 1024
    ).toFixed(1)} KB`,
  }
}

export { partText }