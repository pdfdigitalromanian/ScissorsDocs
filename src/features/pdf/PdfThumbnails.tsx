import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { renderPdfPageToCanvas } from './pdfjs'
import { usePdfSession } from './PdfSessionProvider'

const THUMBNAIL_WIDTH = 120

interface PdfThumbnailItemProps {
  pageNumber: number
  active: boolean
  onSelect: (pageNumber: number) => void
}

function PdfThumbnailItem({ pageNumber, active, onSelect }: PdfThumbnailItemProps) {
  const session = usePdfSession()
  const wrapperRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    session.document
      ?.getPage(pageNumber)
      .then((loaded) => {
        if (!cancelled) setPage(loaded)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pageNumber, session.document])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true)
        else setVisible(false)
      },
      { rootMargin: '300px 0px', threshold: 0.01 },
    )
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible || !page || !canvas) return
    const base = page.getViewport({ scale: 1 })
    const scale = THUMBNAIL_WIDTH / base.width
    let task: RenderTask | null = null
    try {
      task = renderPdfPageToCanvas(canvas, page, scale)
      task.promise.catch(() => undefined)
    } catch {
      // Canvas unavailable — the thumbnail stays blank.
    }
    return () => task?.cancel()
  }, [visible, page])

  return (
    <button
      ref={wrapperRef}
      type="button"
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? 'page' : undefined}
      className={`pdf-thumbnail${active ? ' pdf-thumbnail--active' : ''}`}
      onClick={() => onSelect(pageNumber)}
    >
      <span className="pdf-thumbnail__frame">
        <canvas ref={canvasRef} className="pdf-thumbnail__canvas" aria-hidden="true" />
      </span>
      <span className="pdf-thumbnail__number">{pageNumber}</span>
    </button>
  )
}

/**
 * PdfThumbnails is the real page thumbnail strip for the current PDF
 * session. Pages render lazily as they scroll near the viewport and
 * clicking a thumbnail navigates the main viewer to that page.
 */
export function PdfThumbnails() {
  const session = usePdfSession()
  const pageNumbers = Array.from({ length: session.numPages }, (_, index) => index + 1)

  if (session.status !== 'ready') {
    return <p className="panel-region__hint">Thumbnails appear when a PDF is open.</p>
  }

  return (
    <div className="pdf-thumbnails" role="list" aria-label="PDF page thumbnails">
      {pageNumbers.map((pageNumber) => (
        <PdfThumbnailItem
          key={pageNumber}
          pageNumber={pageNumber}
          active={session.currentPage === pageNumber}
          onSelect={session.goToPage}
        />
      ))}
    </div>
  )
}
