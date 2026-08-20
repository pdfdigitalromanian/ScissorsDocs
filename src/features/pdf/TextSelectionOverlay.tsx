import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SelectedTextRun } from '@/features/editor/model'
import './text-selection-overlay.css'

export interface RunTransform {
  dx: number
  dy: number
  width: number
  height: number
  rotation: number
}

interface TextSelectionOverlayProps {
  selected: SelectedTextRun
  onSelect: (run: SelectedTextRun) => void
  onDoubleClick: (run: SelectedTextRun) => void
  onMove: (run: SelectedTextRun, dx: number, dy: number) => void
  onResize: (
    run: SelectedTextRun,
    dx: number,
    dy: number,
    corner: 'nw' | 'ne' | 'sw' | 'se',
  ) => void
  onRotate: (run: SelectedTextRun, angle: number) => void
  onTransformEnd: (run: SelectedTextRun, transform: RunTransform) => void
  onDelete: (run: SelectedTextRun) => void
  /** Live drag displacement applied to the box position so the bounding
   * box and its handles follow the text while it is being dragged. */
  dragOffset?: { dx: number; dy: number } | null
}

type DragMode =
  | { type: 'move'; startX: number; startY: number }
  | {
      type: 'resize'
      startX: number
      startY: number
      corner: 'nw' | 'ne' | 'sw' | 'se'
    }
  | { type: 'rotate'; centerX: number; centerY: number; startAngle: number }

function resizeWidth(
  start: { width: number; left: number },
  dx: number,
  corner: 'nw' | 'ne' | 'sw' | 'se',
): number {
  const delta = corner === 'nw' || corner === 'sw' ? -dx : dx
  return Math.max(12, start.width + delta)
}

function resizeHeight(
  start: { height: number; top: number },
  dy: number,
  corner: 'nw' | 'ne' | 'sw' | 'se',
): number {
  const delta = corner === 'nw' || corner === 'ne' ? -dy : dy
  return Math.max(6, start.height + delta)
}

export default function TextSelectionOverlay({
  selected,
  onDoubleClick,
  onMove,
  onResize,
  onRotate,
  onTransformEnd,
  onDelete,
  dragOffset,
}: TextSelectionOverlayProps) {
  const dragRef = useRef<DragMode | null>(null)
  const startBoundsRef = useRef(selected.bounds)
  const overlayRef = useRef<HTMLDivElement>(null)
  const rotationRef = useRef<HTMLDivElement>(null)

  function getBounds() {
    return selected.bounds
  }

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.stopPropagation()
      event.preventDefault()
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      startBoundsRef.current = { ...selected.bounds }
      dragRef.current = { type: 'move', startX: event.clientX, startY: event.clientY }
    },
    [selected],
  )

  const handlePointerDownResize = useCallback(
    (event: ReactPointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
      event.stopPropagation()
      event.preventDefault()
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      startBoundsRef.current = { ...selected.bounds }
      dragRef.current = { type: 'resize', startX: event.clientX, startY: event.clientY, corner }
    },
    [selected],
  )

  const handlePointerDownRotate = useCallback(
    (event: ReactPointerEvent) => {
      event.stopPropagation()
      event.preventDefault()
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      startBoundsRef.current = { ...selected.bounds }
      const rect = selected.element.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const startAngle =
        (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
        Math.PI
      dragRef.current = { type: 'rotate', centerX, centerY, startAngle }
    },
    [selected],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      event.preventDefault()

      if (drag.type === 'move') {
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        onMove(selected, dx, dy)
      } else if (drag.type === 'resize') {
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        onResize(selected, dx, dy, drag.corner)
      } else if (drag.type === 'rotate') {
        const angle =
          (Math.atan2(
            event.clientY - drag.centerY,
            event.clientX - drag.centerX,
          ) *
            180) /
          Math.PI
        const delta = angle - drag.startAngle
        onRotate(selected, delta)
      }
    },
    [selected, onMove, onResize, onRotate],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current
      const start = startBoundsRef.current
      dragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (!drag) return
      if (drag.type === 'move') {
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        onTransformEnd(selected, {
          dx,
          dy,
          width: start.width,
          height: start.height,
          rotation: start.rotation,
        })
      } else if (drag.type === 'resize') {
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        onTransformEnd(selected, {
          dx: 0,
          dy: 0,
          width: resizeWidth(start, dx, drag.corner),
          height: resizeHeight(start, dy, drag.corner),
          rotation: start.rotation,
        })
      } else if (drag.type === 'rotate') {
        const angle =
          (Math.atan2(
            event.clientY - drag.centerY,
            event.clientX - drag.centerX,
          ) *
            180) /
          Math.PI
        onTransformEnd(selected, {
          dx: 0,
          dy: 0,
          width: start.width,
          height: start.height,
          rotation: start.rotation + (angle - drag.startAngle),
        })
      }
    },
    [selected, onTransformEnd],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (document.activeElement === document.body) {
          onDelete(selected)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selected, onDelete])

  const b = getBounds()
  const pad = 4
  const dragX = dragOffset?.dx ?? 0
  const dragY = dragOffset?.dy ?? 0
  const style: React.CSSProperties = {
    position: 'absolute',
    left: b.left - pad + dragX,
    top: b.top - pad + dragY,
    width: b.width + pad * 2,
    height: b.height + pad * 2,
    pointerEvents: 'auto',
  }

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    background: 'var(--color-surface)',
    border: '2px solid var(--color-primary)',
    borderRadius: 2,
    pointerEvents: 'auto',
    cursor: 'pointer',
    zIndex: 2,
  }

  return (
    <div
      ref={overlayRef}
      className="text-selection-overlay"
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick(selected)
      }}
    >
      <div className="text-selection-overlay__fill" />
      <div className="text-selection-overlay__border" />

      {/* Corner resize handles */}
      <div
        style={{ ...handleStyle, left: -5, top: -5, cursor: 'nw-resize' }}
        onPointerDown={(e) => handlePointerDownResize(e, 'nw')}
      />
      <div
        style={{
          ...handleStyle,
          right: -5,
          top: -5,
          left: 'auto',
          cursor: 'ne-resize',
        }}
        onPointerDown={(e) => handlePointerDownResize(e, 'ne')}
      />
      <div
        style={{
          ...handleStyle,
          left: -5,
          bottom: -5,
          top: 'auto',
          cursor: 'sw-resize',
        }}
        onPointerDown={(e) => handlePointerDownResize(e, 'sw')}
      />
      <div
        style={{
          ...handleStyle,
          right: -5,
          bottom: -5,
          top: 'auto',
          left: 'auto',
          cursor: 'se-resize',
        }}
        onPointerDown={(e) => handlePointerDownResize(e, 'se')}
      />

      {/* Rotation handle */}
      <div
        ref={rotationRef}
        className="text-selection-overlay__rotation"
        style={{
          position: 'absolute',
          left: '50%',
          top: -32,
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
          cursor: 'grab',
          zIndex: 2,
        }}
        onPointerDown={handlePointerDownRotate}
      >
        <div className="text-selection-overlay__rotation-line" />
        <div className="text-selection-overlay__rotation-handle" />
      </div>

      {/* Delete button */}
      <button
        type="button"
        className="text-selection-overlay__delete"
        aria-label="Delete text"
        title="Delete text"
        style={{
          position: 'absolute',
          right: -34,
          top: -5,
          width: 24,
          height: 24,
          border: 'none',
          borderRadius: '50%',
          background: 'var(--color-danger, #dc2626)',
          color: '#fff',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          zIndex: 3,
        }}
        onClick={(event) => {
          event.stopPropagation()
          onDelete(selected)
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
