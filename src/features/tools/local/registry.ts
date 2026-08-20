import type { LocalToolHandler } from './types'
import { imagesToPdfHandler } from './handlers/images-to-pdf'
import { pdfToImagesHandler } from './handlers/pdf-to-images'
import { pdfToTextHandler } from './handlers/pdf-to-text'
import { textToPdfHandler } from './handlers/text-to-pdf'
import { htmlToPdfHandler } from './handlers/html-to-pdf'
import { compressPdfHandler } from './handlers/compress-pdf'
import { wordToPdfHandler } from './handlers/word-to-pdf'
import { pptxToPdfHandler } from './handlers/pptx-to-pdf'
import { xlsxToPdfHandler } from './handlers/xlsx-to-pdf'
import { pdfToPptxHandler } from './handlers/pdf-to-pptx'
import { pdfToXlsxHandler } from './handlers/pdf-to-xlsx'

const handlers: Record<string, LocalToolHandler> = {
  'convert-images-to-pdf': imagesToPdfHandler,
  'convert-pdf-to-images': pdfToImagesHandler,
  'convert-pdf-to-text': pdfToTextHandler,
  'convert-text-to-pdf': textToPdfHandler,
  'convert-html-to-pdf': htmlToPdfHandler,
  'optimize-compress': compressPdfHandler,
  'convert-word-to-pdf': wordToPdfHandler,
  'convert-pptx-to-pdf': pptxToPdfHandler,
  'convert-xlsx-to-pdf': xlsxToPdfHandler,
  'convert-pdf-to-pptx': pdfToPptxHandler,
  'convert-pdf-to-xlsx': pdfToXlsxHandler,
}

/** True when the tool can run entirely in the browser, offline. */
export function isLocalTool(toolId: string): boolean {
  return toolId in handlers
}

/** Returns the local (browser-side) handler for a tool, if one exists. */
export function getLocalToolHandler(
  toolId: string,
): LocalToolHandler | undefined {
  return handlers[toolId]
}