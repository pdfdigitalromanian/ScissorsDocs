/**
 * Configuration for the online Office ↔ PDF conversion workflows (Phase 4.9).
 *
 * DOCX ↔ PDF runs on the Python tools server. PPTX/XLSX conversions have no
 * backend engine configured yet — the UI still provides the workflow but
 * clearly explains that the online engine is unavailable instead of faking a
 * client-side conversion.
 */
export interface ConversionConfig {
  toolId: string
  label: string
  description: string
  from: string
  to: string
  accept: string
  /** Source file extensions accepted by this conversion. */
  extensions: string[]
  /** Output file extension (hint only; the server names the file). */
  outputExtension: string
  /** Whether the online tools server actually implements this engine. */
  serverEngine: boolean
  /** Whether a local, in-browser engine implements this conversion. */
  localEngine?: boolean
  resultIsPdf: boolean
}

export const CONVERSION_CONFIGS: ConversionConfig[] = [
  {
    toolId: 'convert-word-to-pdf',
    label: 'Word to PDF',
    description: 'Convert a .docx document into a PDF.',
    from: 'Word (.docx)',
    to: 'PDF',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
    outputExtension: '.pdf',
    serverEngine: false,
    localEngine: true,
    resultIsPdf: true,
  },
  {
    toolId: 'convert-pdf-to-word',
    label: 'PDF to Word',
    description: 'Convert a PDF into an editable .docx document.',
    from: 'PDF',
    to: 'Word (.docx)',
    accept: '.pdf,application/pdf',
    extensions: ['.pdf'],
    outputExtension: '.docx',
    serverEngine: true,
    resultIsPdf: false,
  },
  {
    toolId: 'convert-pptx-to-pdf',
    label: 'PowerPoint to PDF',
    description: 'Convert a .pptx presentation into a PDF.',
    from: 'PowerPoint (.pptx)',
    to: 'PDF',
    accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['.pptx'],
    outputExtension: '.pdf',
    serverEngine: false,
    localEngine: true,
    resultIsPdf: true,
  },
  {
    toolId: 'convert-pdf-to-pptx',
    label: 'PDF to PowerPoint',
    description: 'Convert a PDF into a .pptx presentation with each page on a slide.',
    from: 'PDF',
    to: 'PowerPoint (.pptx)',
    accept: '.pdf,application/pdf',
    extensions: ['.pdf'],
    outputExtension: '.pptx',
    serverEngine: false,
    localEngine: true,
    resultIsPdf: false,
  },
  {
    toolId: 'convert-xlsx-to-pdf',
    label: 'Excel to PDF',
    description: 'Convert an .xlsx spreadsheet into a PDF.',
    from: 'Excel (.xlsx)',
    to: 'PDF',
    accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx'],
    outputExtension: '.pdf',
    serverEngine: false,
    localEngine: true,
    resultIsPdf: true,
  },
  {
    toolId: 'convert-pdf-to-xlsx',
    label: 'PDF to Excel',
    description: 'Convert a PDF into an editable .xlsx spreadsheet with the text of each page.',
    from: 'PDF',
    to: 'Excel (.xlsx)',
    accept: '.pdf,application/pdf',
    extensions: ['.pdf'],
    outputExtension: '.xlsx',
    serverEngine: false,
    localEngine: true,
    resultIsPdf: false,
  },
]

export function getConversionConfig(toolId: string): ConversionConfig | null {
  return CONVERSION_CONFIGS.find((config) => config.toolId === toolId) ?? null
}