import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { pdfjs, renderPdfPageToCanvas } from './pdfjs'

interface PdfPageViewProps {
  page: PDFPageProxy
  scale: number
  /** Scroll container used as the intersection root for lazy rendering. */
  root?: Element | null
  /** Reports the page number whenever the page becomes visible. */
  onVisible?: (pageNumber: number) => void
  /** Frees the canvas when the page leaves the viewport (large documents). */
  clearWhenHidden?: boolean
  className?: string
}

/**
 * PdfPageView renders a single PDF page into a canvas. The wrapper keeps
 * the page's dimensions stable from the viewport so layout does not jump
 * while the page lazily renders, and the canvas is only rasterized once
 * it scrolls near the viewport.
 */
export function PdfPageView({
  page,
  scale,
  root,
  onVisible,
  clearWhenHidden = false,
  className = '',
}: PdfPageViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const pageNumber = page.pageNumber
  const viewport = page.getViewport({ scale })

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting) {
          setVisible(true)
          onVisible?.(pageNumber)
        } else {
          setVisible(false)
        }
      },
      { root: root ?? null, rootMargin: '400px 0px', threshold: 0.01 },
    )

    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [root, pageNumber, onVisible])

  useEffect(() => {
    if (!visible) {
      if (clearWhenHidden) {
        const canvas = canvasRef.current
        if (canvas && canvas.width > 0) {
          canvas.width = 0
          canvas.height = 0
        }
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let task: RenderTask | null = null
    try {
      task = renderPdfPageToCanvas(canvas, page, scale)
      task.promise.catch((reason: unknown) => {
        if (reason instanceof pdfjs.RenderingCancelledException) return
        console.error(`Failed to render PDF page ${pageNumber}.`, reason)
      })
    } catch (reason) {
      console.error(`Failed to render PDF page ${pageNumber}.`, reason)
    }

    return () => {
      task?.cancel()
    }
  }, [visible, scale, page, pageNumber, clearWhenHidden])

  return (
    <div
      ref={wrapperRef}
      data-page-number={pageNumber}
      className={`pdf-page${className ? ` ${className}` : ''}`}
      style={{ width: viewport.width, height: viewport.height }}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" aria-hidden="true" />
    </div>
  )
}
