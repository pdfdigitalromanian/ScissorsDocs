import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useResizeHandle } from './useResizeHandle'
import type { ResizeDirection } from './useResizeHandle'
import './layout-workspace.css'

export type SplitDirection = ResizeDirection

interface SplitPaneProps {
  direction?: SplitDirection
  /** Controlled size of the first pane, as a percentage. */
  size?: number
  /** Initial size of the first pane, as a percentage, when uncontrolled. */
  defaultSize?: number
  minSize?: number
  maxSize?: number
  resizable?: boolean
  ariaLabel?: string
  onResize?: (size: number) => void
  children: [ReactNode, ReactNode]
  className?: string
}

/**
 * SplitPane renders two panes separated by a resizable divider. The
 * divider is a keyboard-operable separator (Arrow keys, Home, End) and
 * supports pointer dragging with pointer capture.
 */
export default function SplitPane({
  direction = 'horizontal',
  size: controlledSize,
  defaultSize = 50,
  minSize = 20,
  maxSize = 80,
  resizable = true,
  ariaLabel = 'Resize panels',
  onResize,
  children,
  className = '',
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [internalSize, setInternalSize] = useState(defaultSize)

  const isControlled = controlledSize !== undefined
  const size = isControlled ? controlledSize : internalSize

  const commitSize = (next: number) => {
    const clamped = Math.min(Math.max(next, minSize), maxSize)
    if (!isControlled) setInternalSize(clamped)
    onResize?.(clamped)
  }

  const {
    active,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
  } = useResizeHandle({
    direction,
    value: size,
    min: minSize,
    max: maxSize,
    disabled: !resizable,
    applyDelta: (startValue, deltaPx) => {
      const container = containerRef.current
      if (!container) return startValue
      const rect = container.getBoundingClientRect()
      const containerSize =
        direction === 'horizontal' ? rect.width : rect.height
      if (containerSize <= 0) return startValue
      return startValue + (deltaPx / containerSize) * 100
    },
    onChange: commitSize,
  })

  const paneStyle = { '--split-size': `${size}%` } as CSSProperties

  return (
    <div
      ref={containerRef}
      className={`split-pane${direction === 'vertical' ? ' split-pane--vertical' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <div
        className="split-pane__pane split-pane__pane--first"
        style={paneStyle}
      >
        {children[0]}
      </div>
      <div
        role="separator"
        tabIndex={resizable ? 0 : -1}
        aria-label={ariaLabel}
        aria-orientation={
          direction === 'horizontal' ? 'vertical' : 'horizontal'
        }
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={Math.round(size)}
        className={`split-pane__divider${
          active ? ' split-pane__divider--active' : ''
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane__pane split-pane__pane--second">
        {children[1]}
      </div>
    </div>
  )
}
