import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFPageProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

export interface PageRenderTask {
  promise: Promise<void>
  cancel: () => void
}

/**
 * Renders a page into a canvas at the given CSS-pixel scale, scaling by
 * the device pixel ratio for crisp output. Returns a task with a
 * `promise`/`cancel()` so callers can cancel it when the page leaves the
 * viewport.
 *
 * Renders into an offscreen canvas first and only blits the finished
 * result onto the visible canvas afterward — resizing (`canvas.width =
 * …`) clears a canvas synchronously, and pdf.js paints in incrementally
 * over the following frames, so resizing the *visible* canvas up front
 * left a real blank-then-redraw flash on screen for however long the
 * render took. Rendering offscreen and blitting once means the visible
 * canvas only ever changes in a single synchronous step, from one
 * complete frame directly to the next — no visible flash, and (unlike
 * skipping the redraw) it still always reflects the actual current
 * content, so what's on screen and what's saved never drift apart.
 */
export function renderPdfPageToCanvas(
  canvas: HTMLCanvasElement,
  page: PDFPageProxy,
  scale: number,
  operationsFilter?: (index: number) => boolean,
): PageRenderTask {
  const pixelRatio = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale * pixelRatio })
  const width = Math.floor(viewport.width)
  const height = Math.floor(viewport.height)
  const cssWidth = viewport.width / pixelRatio
  const cssHeight = viewport.height / pixelRatio

  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const offscreenContext = offscreen.getContext('2d')
  if (!offscreenContext) {
    throw new Error('Canvas 2D rendering is not available in this browser.')
  }

  const renderTask = page.render({
    canvas: offscreen,
    viewport,
    operationsFilter,
  })

  let cancelled = false

  const promise = renderTask.promise
    .then(() => {
      if (cancelled) return
      canvas.width = width
      canvas.height = height
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Canvas 2D rendering is not available in this browser.')
      }
      context.drawImage(offscreen, 0, 0)
    })
    .catch((reason: unknown) => {
      /* Cancellation (ours or pdf.js's own RenderingCancelledException,
       * thrown when a page scrolls out of view mid-render) is expected
       * and handled here so callers no longer need to special-case it —
       * neither a blit nor a rejection should happen for a stale render
       * whose result nobody wants anymore. */
      if (cancelled) return
      if (reason instanceof pdfjs.RenderingCancelledException) return
      throw reason
    })

  return {
    promise,
    cancel: () => {
      cancelled = true
      renderTask.cancel()
    },
  }
}