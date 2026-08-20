/**
 * EditorPageSurface — the edit-mode overlay host for a single rendered page.
 * It bridges the pdf.js page view (which knows the render scale) with the
 * element overlay (which works in PDF points). Nothing renders here unless
 * edit mode is active.
 */
import { usePdfEditor } from './PdfEditorProvider'
import { ElementOverlay } from './ElementOverlay'

interface EditorPageSurfaceProps {
  /** 0-based page index. */
  pageIndex: number
  /** Page size in PDF points (unrotated content space). */
  pageWidth: number
  pageHeight: number
  /** Rendered scale: CSS px per PDF point. */
  scale: number
}

export function EditorPageSurface({
  pageIndex,
  pageWidth,
  pageHeight,
  scale,
}: EditorPageSurfaceProps) {
  const { editMode, signMode } = usePdfEditor()
  if (!editMode && !signMode) return null
  return (
    <ElementOverlay
      page={pageIndex}
      width={pageWidth}
      height={pageHeight}
      scale={scale}
    />
  )
}
