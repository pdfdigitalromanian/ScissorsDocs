import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

/**
 * Renders a page into a canvas at the given CSS-pixel scale, scaling by
 * the device pixel ratio for crisp output. Returns the render task so
 * callers can cancel it when the page leaves the viewport.
 */
export function renderPdfPageToCanvas(
  canvas: HTMLCanvasElement,
  page: PDFPageProxy,
  scale: number,
  operationsFilter?: (index: number) => boolean,
): RenderTask {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D rendering is not available in this browser.')
  }
  const pixelRatio = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale * pixelRatio })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${viewport.width / pixelRatio}px`
  canvas.style.height = `${viewport.height / pixelRatio}px`
  return page.render({ canvas, viewport, operationsFilter })
}
