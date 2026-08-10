import type { HTMLAttributes } from 'react'
import './layout-workspace.css'

/**
 * CustomScrollContainer is a scroll container intended to pair with a
 * custom scrollbar (hidden by default, styled via the theme). Content
 * stays scrollable and observable for assistive technology.
 */
export default function CustomScrollContainer({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`scroll-area scroll-area--custom${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
