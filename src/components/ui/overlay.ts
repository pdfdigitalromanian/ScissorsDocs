import { useEffect, useId, useRef } from 'react'
import { trapFocus } from './focus'

export function useOverlayBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return

    previousFocus.current = document.activeElement as HTMLElement | null
    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const container = panelRef.current
    const cleanupTrap = container ? trapFocus(container) : () => undefined
    panelRef.current?.focus()

    return () => {
      document.body.style.overflow = bodyOverflow
      cleanupTrap()
      previousFocus.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return { panelRef, titleId, descriptionId }
}
