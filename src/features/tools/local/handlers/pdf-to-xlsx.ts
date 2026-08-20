import { localBytes, formatBytes } from '../types'
import type { LocalToolContext, LocalToolResult } from '../types'
import { loadPdfDocument, extractPageText } from '../lib/pdf'
import { zipArchive, escXml } from '../lib/office'

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

function contentTypes(sheetCount: number): string {
  let s = XML
  s += `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  s += `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  s += `<Default Extension="xml" ContentType="application/xml"/>`
  s += `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
  s += `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
  for (let i = 1; i <= sheetCount; i += 1) {
    s += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  }
  s += `</Types>`
  return s
}

function workbookXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<sheet name="Page ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
  ).join('')
  return (
    XML +
    `<workbook xmlns="${X}" xmlns:r="${OFFICE_REL_NS}">${sheets}</workbook>`
  )
}

function workbookRels(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  )
  rels.push(
    `<Relationship Id="rId${sheetCount + 1}" Type="${OFFICE_REL_NS}/styles" Target="styles.xml"/>`,
  )
  return XML + `<Relationships xmlns="${REL_NS}">${rels.join('')}</Relationships>`
}

function worksheetXml(lines: string[]): string {
  const rows = lines
    .map(
      (line, index) =>
        `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">${escXml(line)}</t></is></c></row>`,
    )
    .join('')
  return XML + `<worksheet xmlns="${X}"><sheetData>${rows}</sheetData></worksheet>`
}

/**
 * Local PDF → XLSX conversion. The readable text of each PDF page is
 * extracted with pdf.js and written into its own worksheet, one line per
 * row, so the spreadsheet opens in Excel and Google Sheets with no server
 * or installed libraries.
 */
export async function pdfToXlsxHandler(
  context: LocalToolContext,
): Promise<LocalToolResult> {
  const { files, onProgress } = context
  if (files.length === 0) throw new Error('Choose a PDF file to convert.')

  const source = files.find((file) => /\.pdf$/i.test(file.name)) ?? files[0]
  const bytes = await localBytes(source)
  const loaded = await loadPdfDocument(bytes)
  try {
    const { document } = loaded
    const pageCount = document.numPages
    const pageTexts: string[] = []
    for (let index = 1; index <= pageCount; index += 1) {
      onProgress?.(
        Math.round((index / pageCount) * 100),
        `Extracting page ${index} of ${pageCount}`,
      )
      const page = await document.getPage(index)
      const text = await extractPageText(page)
      pageTexts.push(text.split('\n').filter((line) => line.trim()).join('\n'))
    }

    const parts: Record<string, Uint8Array> = {}
    const enc = new TextEncoder()
    const put = (name: string, xml: string) => {
      parts[name] = enc.encode(xml)
    }

    put('[Content_Types].xml', contentTypes(pageCount))
    put('_rels/.rels', rootRels())
    put('xl/workbook.xml', workbookXml(pageCount))
    put('xl/_rels/workbook.xml.rels', workbookRels(pageCount))
    put('xl/styles.xml', stylesXml())
    pageTexts.forEach((text, index) => {
      const lines = text.length ? text.split('\n') : ['(No text on this page)']
      put(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(lines))
    })

    const outBytes = zipArchive(parts)
    const blob = new Blob([outBytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const baseName = source.name.replace(/\.pdf$/i, '') || 'spreadsheet'
    return {
      blob,
      filename: `${baseName}.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      summary: `${pageCount} page${pageCount > 1 ? 's' : ''} · ${formatBytes(
        blob.size,
      )}`,
    }
  } finally {
    await loaded.destroy()
  }
}

function rootRels(): string {
  return (
    XML +
    `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  )
}

function stylesXml(): string {
  return (
    XML +
    `<styleSheet xmlns="${X}">` +
    `<fonts count="1"><font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
    `<cellXfs count="1"><xf/></cellXfs>` +
    `</styleSheet>`
  )
}