import type { HTMLAttributes } from 'react'
import './layout-floating.css'

export type FloatingPanelPlacement =
  'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'

interface FloatingPanelProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean
  placement?: FloatingPanelPlacement
}

/**
 * FloatingPanel is a presentational, absolutely positioned surface
 * anchored by its placement class. Render it inside a `position:
 * relative` wrapper next to the trigger element it belongs to.
 */
export default function FloatingPanel({
  open = false,
  placement = 'bottom-start',
  className = '',
  ...rest
}: FloatingPanelProps) {
  const classes = [
    'floating-panel',
    `floating-panel--${placement}`,
    open ? 'floating-panel--open' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes} aria-hidden={!open} {...rest} />
}
