import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { PdfTextEdit } from '@/features/editor/model'
import { pdfjs, renderPdfPageToCanvas } from './pdfjs'
import { PdfTextEditLayer } from './PdfTextEditLayer'
import type { PdfTextSelectionController } from './text-format'

interface PdfPageViewProps {
  page: PDFPageProxy
  scale: number
  /** Scroll container used as the intersection root for lazy rendering. */
  root?: Element | null
  /** Reports the page number whenever the page becomes visible. */
  onVisible?: (pageNumber: number) => void
  /** Frees the canvas when the page leaves the viewport (large documents). */
  clearWhenHidden?: boolean
  textEditing?: boolean
  onTextEdit?: (edit: PdfTextEdit) => void
  onTextSelectionChange?: (selection: PdfTextSelectionController | null) => void
  className?: string
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

function EditablePageLayers({
  page,
  scale,
  sourceCanvas,
  onTextEdit,
  onTextSelectionChange,
}: {
  page: PDFPageProxy
  scale: number
  sourceCanvas: HTMLCanvasElement
  onTextEdit: (edit: PdfTextEdit) => void
  onTextSelectionChange: (selection: PdfTextSelectionController | null) => void
}) {
  const [backgroundCanvas, setBackgroundCanvas] =
    useState<HTMLCanvasElement | null>(null)
  const [backgroundReady, setBackgroundReady] = useState(false)
  const pageNumber = page.pageNumber

  useEffect(() => {
    if (!backgroundCanvas) return

    let cancelled = false
    let task: RenderTask | null = null
    void page
      .getOperatorList()
      .then((operators) => {
        if (cancelled) return
        const textOperations = new Set([
          pdfjs.OPS.showText,
          pdfjs.OPS.showSpacedText,
          pdfjs.OPS.nextLineShowText,
          pdfjs.OPS.nextLineSetSpacingShowText,
        ])
        task = renderPdfPageToCanvas(
          backgroundCanvas,
          page,
          scale,
          (index) => !textOperations.has(operators.fnArray[index]),
        )
        return task.promise
      })
      .then(() => {
        if (!cancelled) setBackgroundReady(true)
      })
      .catch((reason: unknown) => {
        if (reason instanceof pdfjs.RenderingCancelledException) return
        if (!cancelled) {
          console.error(
            `Failed to render the text-free background for page ${pageNumber}.`,
            reason,
          )
        }
      })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [backgroundCanvas, page, pageNumber, scale])

  return (
    <>
      <canvas
        ref={setBackgroundCanvas}
        className="pdf-page__background-canvas"
        aria-hidden="true"
      />
      {backgroundReady && backgroundCanvas ? (
        <PdfTextEditLayer
          page={page}
          scale={scale}
          sourceCanvas={sourceCanvas}
          backgroundCanvas={backgroundCanvas}
          onCommit={onTextEdit}
          onSelectionChange={onTextSelectionChange}
        />
      ) : null}
    </>
  )
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
  textEditing = false,
  onTextEdit,
  onTextSelectionChange,
  className = '',
}: PdfPageViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [readyRenderKey, setReadyRenderKey] = useState('')
  const pageNumber = page.pageNumber
  const viewport = page.getViewport({ scale })
  const renderKey = `${pageNumber}:${scale}`
  const canvasReady = readyRenderKey === renderKey

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
        if (canvas && canvas.width > 0) {
          releaseCanvas(canvas)
        }
      }
      return
    }

    if (!canvas) return

    let cancelled = false
    let task: RenderTask | null = null
    try {
      task = renderPdfPageToCanvas(canvas, page, scale)
      task.promise
        .then(() => {
          if (!cancelled) setReadyRenderKey(renderKey)
        })
        .catch((reason: unknown) => {
          if (reason instanceof pdfjs.RenderingCancelledException) return
          console.error(`Failed to render PDF page ${pageNumber}.`, reason)
        })
    } catch (reason) {
      console.error(`Failed to render PDF page ${pageNumber}.`, reason)
    }

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, scale, page, pageNumber, clearWhenHidden, renderKey, canvas])

  return (
    <div
      ref={wrapperRef}
      data-page-number={pageNumber}
      className={`pdf-page${className ? ` ${className}` : ''}`}
      style={{ width: viewport.width, height: viewport.height }}
    >
      <canvas ref={setCanvas} className="pdf-page__canvas" aria-hidden="true" />
      {visible &&
      textEditing &&
      onTextEdit &&
      onTextSelectionChange &&
      canvasReady &&
      canvas ? (
        <EditablePageLayers
          key={renderKey}
          page={page}
          scale={scale}
          sourceCanvas={canvas}
          onTextEdit={onTextEdit}
          onTextSelectionChange={onTextSelectionChange}
        />
      ) : null}
    </div>
  )
}
