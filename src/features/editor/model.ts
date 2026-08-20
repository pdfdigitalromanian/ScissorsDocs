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
  /** Original text baseline position in PDF points — used to locate and
   * remove the pre-edit run in the content stream. Differs from `x`/`y`
   * after the run has been moved. */
  originalX: number
  originalY: number
  /** Text baseline position in PDF points. */
  x: number
  y: number
  /** Bounds of the original text run in PDF points. */
  width: number
  height: number
  fontSize: number
  /** Horizontal text scale from the PDF text matrix (1 is unscaled). */
  horizontalScale: number
  rotation: number
  color: [number, number, number]
  /** Embedded PDF BaseFont name used to reuse the existing page resource. */
  pdfFontName: string
  /** Original embedded face or one of the locally bundled editor fonts. */
  fontFamily: import('@/features/pdf/text-format').PdfEditorFontFamily
  fontWeight: import('@/features/pdf/text-format').PdfEditorFontWeight
  italic: boolean
  underline: boolean
  /** Additional distance between glyphs, measured in PDF points. */
  letterSpacing: number
  /** Visual width after font, size and spacing changes, in PDF points. */
  renderedWidth: number
  backgroundPatch: {
    png: Uint8Array
    x: number
    y: number
    width: number
    height: number
  }
  text: string
}

/**
 * Describes a selected text run's bounding box in CSS-pixel coordinates
 * relative to the page container. Used by the selection overlay for the
 * bounding box, resize handles, and rotation handle.
 */
export interface TextRunBounds {
  left: number
  top: number
  width: number
  height: number
  rotation: number
}

/** Describes a selected text run for the inspector and transform operations. */
export interface SelectedTextRun {
  /** Zero-based text item index within the page's text content. */
  index: number
  /** The DOM element for this text run. */
  element: HTMLElement
  /** Bounding box in CSS-pixel coordinates relative to the page container. */
  bounds: TextRunBounds
  /** PDF-point coordinates from the original text item transform. */
  pdfX: number
  pdfY: number
  pdfWidth: number
  pdfHeight: number
  pdfRotation: number
  originalText: string
  pdfFontName: string
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
