/**
 * Screen ↔ PDF coordinate helpers for the element overlay.
 *
 * Elements are stored in PDF points with a top-left origin (unrotated
 * content space), matching what the pdf.js canvas renders. A page rendered
 * at `scale` maps 1 PDF point → `scale` CSS pixels, so conversions are
 * simple scale factors that stay stable across zoom, resize and page size.
 */
import type { Point } from './elements'

/** Converts a screen offset (CSS px) to PDF points at the given scale. */
export function screenToPdfPoint(screenX: number, screenY: number, scale: number): Point {
  return { x: screenX / scale, y: screenY / scale }
}

/** Converts a PDF-point position to screen CSS px at the given scale. */
export function pdfToScreenPoint(pdfX: number, pdfY: number, scale: number): Point {
  return { x: pdfX * scale, y: pdfY * scale }
}

/** Converts a screen delta to a PDF-point delta at the given scale. */
export function screenToPdfDelta(dx: number, dy: number, scale: number): Point {
  return { x: dx / scale, y: dy / scale }
}
