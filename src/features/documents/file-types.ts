import type { DocumentFileType } from './types'

/**
 * Registry of file types the local document workspace genuinely supports.
 * PDF, images and plain text get real previews; office documents are
 * registered, downloadable and open in the workspace with honest metadata
 * (their editors arrive with later milestones).
 */
export const SUPPORTED_FILE_TYPES: DocumentFileType[] = [
  {
    extension: 'pdf',
    mime: 'application/pdf',
    label: 'PDF',
    kind: 'pdf',
    tone: 'primary',
    icon: 'file',
  },
  {
    extension: 'png',
    mime: 'image/png',
    label: 'PNG Image',
    kind: 'image',
    tone: 'secondary',
    icon: 'image',
  },
  {
    extension: 'jpg',
    mime: 'image/jpeg',
    label: 'JPEG Image',
    kind: 'image',
    tone: 'secondary',
    icon: 'image',
  },
  {
    extension: 'jpeg',
    mime: 'image/jpeg',
    label: 'JPEG Image',
    kind: 'image',
    tone: 'secondary',
    icon: 'image',
  },
  {
    extension: 'webp',
    mime: 'image/webp',
    label: 'WEBP Image',
    kind: 'image',
    tone: 'secondary',
    icon: 'image',
  },
  {
    extension: 'txt',
    mime: 'text/plain',
    label: 'Plain Text',
    kind: 'text',
    tone: 'secondary',
    icon: 'file-text',
  },
  {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word Document',
    kind: 'office',
    tone: 'info',
    icon: 'file-text',
  },
  {
    extension: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel Workbook',
    kind: 'office',
    tone: 'success',
    icon: 'form',
  },
  {
    extension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint Presentation',
    kind: 'office',
    tone: 'warning',
    icon: 'monitor',
  },
]

export const FILE_INPUT_ACCEPT = [
  ...SUPPORTED_FILE_TYPES.map((type) => type.mime),
  ...SUPPORTED_FILE_TYPES.map((type) => `.${type.extension}`),
].join(',')

export function getExtensionFromName(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function findFileType(file: Pick<File, 'name' | 'type'>) {
  const extension = getExtensionFromName(file.name)
  const byExtension = SUPPORTED_FILE_TYPES.find(
    (type) => type.extension === extension,
  )
  if (byExtension) return byExtension
  return SUPPORTED_FILE_TYPES.find((type) => type.mime === file.type)
}

export function isSupportedFile(file: Pick<File, 'name' | 'type'>): boolean {
  return findFileType(file) !== undefined
}
