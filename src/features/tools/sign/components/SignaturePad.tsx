import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'

const DEFAULT_COLOR = '#0f172a'

interface SignaturePadProps {
  /** Receives the underlying canvas so the parent can encode it. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onStroke?: (hasContent: boolean) => void
  /** Ink color for drawn strokes. */
  color?: string
}

interface StrokePoint {
  x: number
  y: number
}

/**
 * SignaturePad is a small drawing surface for signatures. It supports mouse,
 * touch and stylus through pointer events and smooths strokes with quadratic
 * midpoint interpolation so the result looks clean in the PDF.
 */
export default function SignaturePad({ canvasRef, onStroke, color }: SignaturePadProps) {
  const strokesRef = useRef<StrokePoint[][]>([])
  const currentRef = useRef<StrokePoint[]>([])
  const drawingRef = useRef(false)
  const hasContentRef = useRef(false)
  const colorRef = useRef(color ?? DEFAULT_COLOR)
  colorRef.current = color ?? DEFAULT_COLOR

  function setupCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dpr = Math.max(2, window.devicePixelRatio || 1)
    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.5 * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = colorRef.current
    ctx.fillStyle = colorRef.current
    redraw(ctx, dpr)
  }

  useEffect(() => {
    setupCanvas()
    const resize = () => setupCanvas()
    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => {
      window.removeEventListener('resize', resize)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Repaint existing strokes when the chosen ink color changes.
  useEffect(() => {
    setupCanvas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color])

  function redraw(ctx: CanvasRenderingContext2D, dpr: number) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    const all = [...strokesRef.current]
    if (currentRef.current.length > 1) all.push(currentRef.current)
    for (const stroke of all) {
      if (stroke.length === 0) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0].x * dpr, stroke[0].y * dpr)
      for (let i = 1; i < stroke.length - 1; i += 1) {
        const midX = ((stroke[i].x + stroke[i + 1].x) / 2) * dpr
        const midY = ((stroke[i].y + stroke[i + 1].y) / 2) * dpr
        ctx.quadraticCurveTo(
          stroke[i].x * dpr,
          stroke[i].y * dpr,
          midX,
          midY,
        )
      }
      const last = stroke[stroke.length - 1]
      ctx.lineTo(last.x * dpr, last.y * dpr)
      ctx.stroke()
    }
  }

  function positionFrom(event: PointerEvent<HTMLCanvasElement>): StrokePoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function handleDown(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    currentRef.current = [positionFrom(event)]
    if (!hasContentRef.current) {
      hasContentRef.current = true
      onStroke?.(true)
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        const dpr = canvasRef.current.width / canvasRef.current.getBoundingClientRect().width || 1
        const point = currentRef.current[0]
        ctx.beginPath()
        ctx.arc(point.x * dpr, point.y * dpr, 1.25 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  function handleMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    event.preventDefault()
    currentRef.current.push(positionFrom(event))
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = canvas.width / canvas.getBoundingClientRect().width || 1
    redraw(ctx, dpr)
  }

  function handleUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    event.preventDefault()
    drawingRef.current = false
    if (currentRef.current.length) {
      strokesRef.current.push(currentRef.current)
    }
    currentRef.current = []
  }

  return (
    <canvas
      ref={canvasRef}
      className="signature-pad"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    />
  )
}
