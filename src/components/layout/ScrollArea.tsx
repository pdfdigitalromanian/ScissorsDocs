import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import './layout-workspace.css'

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible label. Required when the scroll region needs a name. */
  ariaLabel?: string
}

/**
 * ScrollArea is a scrollable region. When labelled it is announced as
 * a region landmark and made keyboard-focusable for assistive users.
 */
const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  function ScrollArea(
    { ariaLabel, children, className = '', ...rest }: ScrollAreaProps,
    ref,
  ) {
    const labelled = Boolean(ariaLabel)
    return (
      <div
        ref={ref}
        role={labelled ? 'region' : undefined}
        aria-label={ariaLabel}
        tabIndex={labelled ? 0 : undefined}
        className={`scroll-area${className ? ` ${className}` : ''}`}
        {...rest}
      >
        {children}
      </div>
    )
  },
)

export { ScrollArea }
export type { ScrollAreaProps }
