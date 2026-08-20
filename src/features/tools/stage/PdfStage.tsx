import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { renderPdfPageToCanvas } from '@/features/pdf/pdfjs'
import Spinner from '@/components/ui/Spinner'
import './stage.css'

interface PdfStageProps {
  page: PDFPageProxy | null
  scale: number
  className?: string
  /** Rendered inside the page-sized overlay, in the same CSS pixel space. */
  children?: ReactNode
}

/**
 * PdfStage renders a single pdf.js page to a canvas sized exactly to the
 * page's CSS dimensions at the given scale. Overlay children are positioned
 * in the same pixel space, so parents can place controls using
 * `page.getViewport({ scale })` coordinates.
 */
export default function PdfStage({
  page,
  scale,
  className,
  children,
}: PdfStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  )

  useEffect(() => {
    if (!page) {
      setSize(null)
      setRendering(false)
      return
    }
    const viewport = page.getViewport({ scale })
    setSize({ width: viewport.width, height: viewport.height })
    setRendering(true)
    if (!canvasRef.current) return
    const task = renderPdfPageToCanvas(canvasRef.current, page, scale)
    task.promise.then(
      () => setRendering(false),
      () => setRendering(false),
    )
    return () => task.cancel()
  }, [page, scale])

  return (
    <div
      className={`pdf-stage${className ? ` ${className}` : ''}`}
      style={
        size
          ? { width: size.width, height: size.height }
          : { width: 480, height: 640 }
      }
    >
      {page ? (
        <>
          <canvas
            ref={canvasRef}
            className="pdf-stage__canvas"
            aria-hidden="true"
          />
          <div className="pdf-stage__overlay">{children}</div>
          {rendering ? (
            <div className="pdf-stage__loading" role="status">
              <Spinner size="sm" label="Rendering page" />
            </div>
          ) : null}
        </>
      ) : (
        <div className="pdf-stage__empty" aria-hidden="true" />
      )}
    </div>
  )
}
