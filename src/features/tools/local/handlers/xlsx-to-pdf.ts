import { rgb } from 'pdf-lib'
import { localBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import {
  A4_SIZE,
  NAMESPACES,
  partXml,
  readOfficeArchive,
} from '../lib/office'

const X = NAMESPACES.x

/**
 * Local Excel (.xlsx) → PDF conversion. Shared strings, worksheets, column
 * widths and row heights are read from the workbook ZIP, and the used range
 * of each sheet is drawn as a grid onto landscape pages.
 */

function childrenByTag(node: Element, tag: string): Element[] {
  return Array.from(node.children).filter(
    (child) => child.localName === tag && child.namespaceURI === X,
  )
}

function cellColumn(reference: string): number {
  let column = 0
  for (const char of reference) {
    if (/[A-Za-z]/.test(char)) column = column * 26 + (char.toUpperCase().charCodeAt(0) - 64)
    else break
  }
  return column - 1
}

function cellRow(reference: string): number {
  const match = reference.match(/(\d+)$/)
  return match ? Number(match[1]) - 1 : 0
}

function columnLetter(index: number): string {
  let out = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    out = String.fromCharCode(65 + remainder) + out
    value = Math.floor((value - 1) / 26)
  }
  return out
}

function readSharedStrings(archive: Record<string, Uint8Array>): string[] {
  const part = archive['xl/sharedStrings.xml']
  if (!part) return []
  const doc = partXml(part)
  const strings: string[] = []
  for (const si of childrenByTag(doc.documentElement, 'si')) {
    const text = (si.textContent ?? '').replace(/\u00a0/g, ' ').trim()
    strings.push(text)
  }
  return strings
}

interface WorksheetInfo {
  name: string
  path: string
}

function readWorksheets(
  archive: Record<string, Uint8Array>,
): WorksheetInfo[] {
  const workbook = archive['xl/workbook.xml']
  if (!workbook) return []
  const doc = partXml(workbook)
  const relsDoc = archive['xl/_rels/workbook.xml.rels']
    ? partXml(archive['xl/_rels/workbook.xml.rels'])
    : null
  const relMap = new Map<string, string>()
  if (relsDoc) {
    for (const rel of Array.from(relsDoc.documentElement.children)) {
      const id = rel.getAttribute('Id') ?? ''
      const target = rel.getAttribute('Target') ?? ''
      if (id && target) {
        // Targets in xl/_rels/workbook.xml.rels are relative to the xl/ folder.
        const cleaned = target.replace(/^\//, '').replace(/^\.\.\//, '')
        relMap.set(id, cleaned.startsWith('xl/') ? cleaned : `xl/${cleaned}`)
      }
    }
  }
  const sheets: WorksheetInfo[] = []
  for (const sheet of Array.from(doc.documentElement.children)) {
    if (sheet.localName !== 'sheet') continue
    const name = sheet.getAttribute('name') ?? 'Sheet'
    const relId = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      ?? sheet.getAttribute('r:id')
    const path = relId && relMap.get(relId)
      ? relMap.get(relId)!
      : `xl/worksheets/sheet${sheets.length + 1}.xml`
    sheets.push({ name, path })
  }
  return sheets
}

interface CellValue {
  value: string
  column: number
  row: number
}

interface SheetData {
  name: string
  cells: CellValue[]
  widths: Map<number, number>
  heights: Map<number, number>
  rowCount: number
  colCount: number
}

function readSheet(
  path: string,
  name: string,
  shared: string[],
  archive: Record<string, Uint8Array>,
): SheetData | null {
  const part = archive[path]
  if (!part) return null
  const doc = partXml(part)
  const cells: CellValue[] = []
  const widths = new Map<number, number>()
  const heights = new Map<number, number>()
  let maxRow = -1
  let maxCol = -1

  for (const node of Array.from(doc.documentElement.children)) {
    if (node.localName === 'cols') {
      for (const col of childrenByTag(node, 'col')) {
        const min = Number(col.getAttribute('min') ?? 1) - 1
        const max = Number(col.getAttribute('max') ?? min + 1) - 1
        const width = Number(col.getAttribute('width') ?? 9)
        for (let index = min; index <= max; index += 1) {
          widths.set(index, width)
        }
      }
    } else if (node.localName === 'sheetData') {
      for (const row of childrenByTag(node, 'row')) {
        const rowIndex = Number(row.getAttribute('r') ?? '0') - 1
        if (row.getAttribute('customHeight') === '1' && row.getAttribute('ht')) {
          heights.set(rowIndex, Number(row.getAttribute('ht')))
        }
        for (const cell of childrenByTag(row, 'c')) {
          const reference = cell.getAttribute('r') ?? ''
          const column = cellColumn(reference)
          const row = cellRow(reference)
          const type = cell.getAttribute('t') ?? ''
          const v = childByTag(cell, 'v')
          const inline = childByTag(cell, 'is')
          let value = ''
          if (type === 's' && v) {
            value = shared[Number(v.textContent)] ?? ''
          } else if (type === 'inlineStr' && inline) {
            value = inline.textContent ?? ''
          } else if (type === 'b' && v) {
            value = v.textContent === '1' ? 'TRUE' : 'FALSE'
          } else if (v) {
            value = v.textContent ?? ''
          }
          maxRow = Math.max(maxRow, row)
          maxCol = Math.max(maxCol, column)
          cells.push({ value, column, row })
        }
      }
    }
  }
  if (maxRow < 0) return null
  return {
    name,
    cells,
    widths,
    heights,
    rowCount: maxRow + 1,
    colCount: maxCol + 1,
  }
}

function childByTag(node: Element, tag: string): Element | null {
  return Array.from(node.children).find(
    (child) => child.localName === tag && child.namespaceURI === X,
  ) ?? null
}

export async function xlsxToPdfHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, options, onProgress } = context
  if (files.length === 0) throw new Error('Choose an .xlsx file to convert.')

  const source = files.find((file) => /\.xlsx$/i.test(file.name)) ?? files[0]
  const bytes = await localBytes(source)
  const archive = readOfficeArchive(bytes)
  const shared = readSharedStrings(archive)
  const worksheets = readWorksheets(archive)
  if (worksheets.length === 0) {
    throw new Error('The .xlsx file does not contain any worksheets.')
  }

  const landscape =
    String(options.orientation ?? 'landscape').toLowerCase() !== 'portrait'
  const pageSize = landscape
    ? { width: A4_SIZE.height, height: A4_SIZE.width }
    : A4_SIZE

  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont('Helvetica')
  const bold = await doc.embedFont('Helvetica-Bold')
  const margin = 36
  const contentWidth = pageSize.width - margin * 2
  const headerHeight = 16
  const defaultRowHeight = 15
  const maxColumnWidth = Math.floor(contentWidth / 4)

  let processed = 0
  for (const sheetMeta of worksheets) {
    onProgress?.(
      Math.round((processed / worksheets.length) * 100),
      `Rendering ${sheetMeta.name}`,
    )
    processed += 1
    const sheet = readSheet(sheetMeta.path, sheetMeta.name, shared, archive)
    if (!sheet) continue

    // Compute column point widths (approx 1 char ≈ 7 pt at 9pt font).
    const colWidths: number[] = []
    let totalWidth = 0
    for (let col = 0; col < sheet.colCount; col += 1) {
      const chars = sheet.widths.get(col) ?? 9
      let width = Math.min(maxColumnWidth, Math.max(36, chars * 6.5))
      // Leave room for content.
      for (const cell of sheet.cells) {
        if (cell.column !== col) continue
        const estimate = 12 + (cell.value.length > 0 ? cell.value.length * 4.2 : 10)
        width = Math.min(maxColumnWidth, Math.max(width, estimate))
      }
      colWidths.push(width)
      totalWidth += width
    }
    // Scale down columns so the table always fits the page width.
    if (totalWidth > contentWidth) {
      const ratio = contentWidth / totalWidth
      for (let col = 0; col < colWidths.length; col += 1) colWidths[col] *= ratio
    }

    let page = doc.addPage([pageSize.width, pageSize.height])
    page.drawText(sheet.name, { x: margin, y: pageSize.height - margin + 4, size: 11, font: bold, color: rgb(0, 0, 0) })

    const startY = pageSize.height - margin - 24
    let cursorY = startY
    const columnXs: number[] = []
    let x = margin
    for (const width of colWidths) {
      columnXs.push(x)
      x += width
    }

    // Header row.
    for (let col = 0; col < sheet.colCount; col += 1) {
      const label = columnLetter(col)
      page.drawRectangle({
        x: columnXs[col],
        y: cursorY - headerHeight,
        width: colWidths[col],
        height: headerHeight,
        color: rgb(0.92, 0.94, 0.97),
        borderColor: rgb(0.6, 0.6, 0.6),
        borderWidth: 0.5,
      })
      page.drawText(label, { x: columnXs[col] + 4, y: cursorY - headerHeight + 3, size: 8, font: bold, color: rgb(0.2, 0.2, 0.2) })
    }
    cursorY -= headerHeight

    const cellsByRow = new Map<number, CellValue[]>()
    for (const cell of sheet.cells) {
      if (!cellsByRow.has(cell.row)) cellsByRow.set(cell.row, [])
      cellsByRow.get(cell.row)!.push(cell)
    }

    for (let row = 0; row < sheet.rowCount; row += 1) {
      const rowHeight = Math.max(
        defaultRowHeight,
        sheet.heights.get(row) ?? defaultRowHeight,
      )
      if (cursorY - rowHeight < margin) {
        cursorY = startY
        // Start a continuation page with the header repeated.
        page = doc.addPage([pageSize.width, pageSize.height])
        for (let col = 0; col < sheet.colCount; col += 1) {
          page.drawRectangle({
            x: columnXs[col],
            y: cursorY - headerHeight,
            width: colWidths[col],
            height: headerHeight,
            color: rgb(0.92, 0.94, 0.97),
            borderColor: rgb(0.6, 0.6, 0.6),
            borderWidth: 0.5,
          })
          page.drawText(columnLetter(col), {
            x: columnXs[col] + 4,
            y: cursorY - headerHeight + 3,
            size: 8,
            font: bold,
            color: rgb(0.2, 0.2, 0.2),
          })
        }
        cursorY -= headerHeight
      }
      const rowCells = cellsByRow.get(row) ?? []
      const cellMap = new Map(rowCells.map((cell) => [cell.column, cell]))
      for (let col = 0; col < sheet.colCount; col += 1) {
        page.drawRectangle({
          x: columnXs[col],
          y: cursorY - rowHeight,
          width: colWidths[col],
          height: rowHeight,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 0.4,
        })
        const cell = cellMap.get(col)
        if (cell && cell.value) {
          const text = cell.value.length > 60 ? `${cell.value.slice(0, 59)}…` : cell.value
          page.drawText(text, {
            x: columnXs[col] + 4,
            y: cursorY - rowHeight + 3,
            size: 8,
            font,
            color: rgb(0.1, 0.1, 0.1),
            maxWidth: colWidths[col] - 8,
          })
        }
      }
      cursorY -= rowHeight
    }
  }

  const outBytes = await doc.save({ useObjectStreams: true })
  const blob = new Blob([outBytes as unknown as BlobPart], {
    type: 'application/pdf',
  })
  const baseName = source.name.replace(/\.xlsx$/i, '') || 'spreadsheet'
  return {
    blob,
    filename: `${baseName}.pdf`,
    mimeType: 'application/pdf',
    summary: `${doc.getPageCount()} page${doc.getPageCount() > 1 ? 's' : ''} · ${(
      blob.size / 1024
    ).toFixed(1)} KB`,
  }
}