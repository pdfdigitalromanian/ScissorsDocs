import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { getTokenSpace } from './space'
import './layout-floating.css'

export type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right'

interface PopoverContainerProps {
  open: boolean
  onClose: () => void
  /** Element the popover anchors to. */
  anchorRef: RefObject<HTMLElement | null>
  placement?: PopoverPlacement
  children: ReactNode
  className?: string
  id?: string
}

interface Position {
  top: number
  left: number
}

function computePosition(
  anchor: HTMLElement,
  placement: PopoverPlacement,
  panel: HTMLElement,
  margin: number,
): Position {
  const anchorRect = anchor.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let top = 0
  let left = 0

  switch (placement) {
    case 'bottom':
      top = anchorRect.bottom + margin
      left = anchorRect.left
      break
    case 'top':
      top = anchorRect.top - margin - panelRect.height
      left = anchorRect.left
      break
    case 'left':
      top = anchorRect.top
      left = anchorRect.left - margin - panelRect.width
      break
    case 'right':
      top = anchorRect.top
      left = anchorRect.right + margin
      break
  }

  if (
    placement === 'bottom' &&
    top + panelRect.height > viewportHeight - margin
  ) {
    top = anchorRect.top - margin - panelRect.height
  } else if (placement === 'top' && top < margin) {
    top = anchorRect.bottom + margin
  }

  if (
    placement === 'right' &&
    left + panelRect.width > viewportWidth - margin
  ) {
    left = anchorRect.left - margin - panelRect.width
  } else if (placement === 'left' && left < margin) {
    left = anchorRect.right + margin
  }

  top = Math.max(
    margin,
    Math.min(top, viewportHeight - panelRect.height - margin),
  )
  left = Math.max(
    margin,
    Math.min(left, viewportWidth - panelRect.width - margin),
  )

  return { top, left }
}

/**
 * PopoverContainer is a generic anchored popover rendered through a
 * portal to the document body. It positions against its anchor,
 * flips/clamps to stay on screen, closes on outside click or Escape,
 * and returns focus to the previously focused element on close.
 */
export default function PopoverContainer({
  open,
  onClose,
  anchorRef,
  placement = 'bottom',
  children,
  className = '',
  id,
}: PopoverContainerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null

    const positionPanel = () => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return
      const next = computePosition(anchor, placement, panel, getTokenSpace())
      panel.style.top = `${next.top}px`
      panel.style.left = `${next.left}px`
      panel.classList.add('popover-container--ready')
    }

    positionPanel()
    panelRef.current?.focus()

    window.addEventListener('resize', positionPanel)
    window.addEventListener('scroll', positionPanel, true)

    return () => {
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
      previousFocusRef.current?.focus()
    }
  }, [open, placement, anchorRef])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      tabIndex={-1}
      className={`popover-container${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>,
    document.body,
  )
}
