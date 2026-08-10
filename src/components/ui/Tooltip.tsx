import { useId, useState } from 'react'
import { cloneElement } from 'react'
import type { ReactElement, ReactNode, SyntheticEvent } from 'react'
import './overlays.css'

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

type EventHandler = (event: SyntheticEvent) => void

interface TooltipChildProps {
  'aria-describedby'?: string
  onFocus?: EventHandler
  onBlur?: EventHandler
  onPointerEnter?: EventHandler
  onPointerLeave?: EventHandler
  onKeyDown?: EventHandler
}

interface TooltipProps {
  content: ReactNode
  children: ReactElement
  position?: TooltipPosition
  className?: string
}

function mergeHandlers(
  existing: EventHandler | undefined,
  next: EventHandler,
): EventHandler {
  if (!existing) return next
  return (event) => {
    existing(event)
    next(event)
  }
}

export default function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()

  const handleShow = () => setOpen(true)
  const handleHide = () => setOpen(false)

  const handleKeyDown = (event: SyntheticEvent) => {
    if ((event.nativeEvent as KeyboardEvent).key === 'Escape') {
      setOpen(false)
    }
  }

  const child = children as ReactElement<TooltipChildProps>
  const trigger = cloneElement(child, {
    'aria-describedby': open ? tooltipId : child.props['aria-describedby'],
    onFocus: mergeHandlers(child.props.onFocus, handleShow),
    onBlur: mergeHandlers(child.props.onBlur, handleHide),
    onPointerEnter: mergeHandlers(child.props.onPointerEnter, handleShow),
    onPointerLeave: mergeHandlers(child.props.onPointerLeave, handleHide),
    onKeyDown: mergeHandlers(child.props.onKeyDown, handleKeyDown),
  })

  return (
    <span className="tooltip-anchor">
      {trigger}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`tooltip tooltip--${position}${
            className ? ` ${className}` : ''
          }`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
