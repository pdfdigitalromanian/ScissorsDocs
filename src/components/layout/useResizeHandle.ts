import { useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

export type ResizeDirection = 'horizontal' | 'vertical'

interface UseResizeHandleOptions {
  /** Layout axis of the resized edge. A vertical divider is 'horizontal'. */
  direction: ResizeDirection
  /** Current size of the primary pane in the caller's unit. */
  value: number
  min: number
  max: number
  /** Keyboard step in the caller's unit. */
  step?: number
  disabled?: boolean
  /**
   * Invert the drag/arrow direction. Set for panes whose divider edge is
   * their leading edge (e.g. a panel docked to the right or bottom), so
   * dragging the divider toward the panel's centre grows it.
   */
  invert?: boolean
  /** Maps a pointer delta (in px) against the drag-start value. */
  applyDelta?: (startValue: number, deltaPx: number) => number
  onChange: (next: number) => void
}

const IDENTITY_DELTA = (startValue: number, deltaPx: number) =>
  startValue + deltaPx

/**
 * useResizeHandle provides the shared pointer + keyboard interaction for a
 * resizable divider. Pointer capture converts drag movement into a value
 * delta; arrow keys, Home and End move the value by the configured step.
 * The return object can be spread onto any divider element.
 */
export function useResizeHandle({
  direction,
  value,
  min,
  max,
  step = 5,
  disabled = false,
  invert = false,
  applyDelta = IDENTITY_DELTA,
  onChange,
}: UseResizeHandleOptions) {
  const dragRef = useRef<{
    pointerId: number
    startClient: number
    startValue: number
  } | null>(null)

  const [active, setActive] = useState(false)

  const clamp = (next: number) => Math.min(Math.max(next, min), max)
  const forwardKey =
    direction === 'horizontal'
      ? invert
        ? 'ArrowLeft'
        : 'ArrowRight'
      : invert
        ? 'ArrowUp'
        : 'ArrowDown'
  const backwardKey =
    direction === 'horizontal'
      ? invert
        ? 'ArrowRight'
        : 'ArrowLeft'
      : invert
        ? 'ArrowDown'
        : 'ArrowUp'

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActive(true)
    dragRef.current = {
      pointerId: event.pointerId,
      startClient: direction === 'horizontal' ? event.clientX : event.clientY,
      startValue: value,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const client = direction === 'horizontal' ? event.clientX : event.clientY
    const delta = (invert ? -1 : 1) * (client - drag.startClient)
    onChange(clamp(applyDelta(drag.startValue, delta)))
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId)
      return
    dragRef.current = null
    setActive(false)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (disabled) return
    switch (event.key) {
      case forwardKey:
        event.preventDefault()
        onChange(clamp(value + step))
        break
      case backwardKey:
        event.preventDefault()
        onChange(clamp(value - step))
        break
      case 'Home':
        event.preventDefault()
        onChange(clamp(min))
        break
      case 'End':
        event.preventDefault()
        onChange(clamp(max))
        break
    }
  }

  return {
    active,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown: handleKeyDown,
  }
}
