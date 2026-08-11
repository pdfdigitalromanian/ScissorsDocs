/** Editor lifecycle status for the active PDF document. */
export type EditorStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Persistence state of the editable document. */
export type EditorSaveState = 'saved' | 'unsaved' | 'saving' | 'save-failed'

/** Page rotation in degrees — always normalized to 0 / 90 / 180 / 270. */
export type PdfRotation = 0 | 90 | 180 | 270

export type RotationDirection = 'clockwise' | 'counter-clockwise'

/** Lightweight descriptor for one page in the editable document. */
export interface EditorPage {
  /** Stable per-session id used for selection and reordering. */
  id: string
  /** Position in the current document (0-based). */
  index: number
  /** Current rotation in degrees. */
  rotation: PdfRotation
  /** Page width in PDF points (before rotation). */
  width: number
  /** Page height in PDF points (before rotation). */
  height: number
}

/** One text run selected from the PDF.js text layer for in-place editing. */
export interface PdfTextEdit {
  /** Zero-based page index. */
  pageIndex: number
  /** Text baseline position in PDF points. */
  x: number
  y: number
  /** Bounds of the original text run in PDF points. */
  width: number
  height: number
  fontSize: number
  text: string
}

/** Input describing a range of pages to extract or split (1-based, inclusive). */
export interface PageRange {
  start: number
  end: number
}

export type SplitMode = 'every' | 'ranges' | 'selection'

/** A produced PDF output (extract, split, merge). */
export interface PdfOutput {
  name: string
  bytes: Uint8Array
  pageCount: number
}

/** Descriptive, user-safe messages for known editor failures. */
export const EDITOR_ERROR_MESSAGES: Record<string, string> = {
  load: 'This PDF could not be opened for editing.',
  unsupported:
    'This file cannot be edited locally. It may use an unsupported PDF feature.',
  insert:
    'The inserted pages could not be added. The file may be corrupted or unsupported.',
  replace:
    'The page could not be replaced. The source file may be corrupted or unsupported.',
  extract: 'The pages could not be extracted into a new PDF.',
  split: 'The document could not be split.',
  merge: 'The documents could not be merged into one PDF.',
  save: 'The changes could not be saved to this device.',
}
