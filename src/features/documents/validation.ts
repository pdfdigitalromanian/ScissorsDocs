import { isSupportedFile } from './file-types'

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024

export type FileValidationErrorCode =
  | 'unsupported-type'
  | 'empty-file'
  | 'oversized-file'
  | 'read-failed'

export interface FileValidationResult {
  ok: boolean
  code?: FileValidationErrorCode
  message?: string
}

function fileNameLabel(name: string): string {
  return name ? `"${name}"` : 'This file'
}

export function validateFile(file: File): FileValidationResult {
  if (!isSupportedFile(file)) {
    return {
      ok: false,
      code: 'unsupported-type',
      message: `${fileNameLabel(
        file.name,
      )} is not a supported file type. Try a PDF, PNG, JPG, WEBP, TXT, DOCX, XLSX or PPTX file instead.`,
    }
  }

  if (file.size === 0) {
    return {
      ok: false,
      code: 'empty-file',
      message: `${fileNameLabel(file.name)} is empty and cannot be opened.`,
    }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: 'oversized-file',
      message: `${fileNameLabel(file.name)} is larger than 200 MB and cannot be opened locally.`,
    }
  }

  return { ok: true }
}
