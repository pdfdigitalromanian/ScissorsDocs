import type { HTMLAttributes } from 'react'
import './layout-page.css'

/**
 * ContentWrapper is a scrollable body region used when a page keeps its
 * own fixed height (e.g. inside a split view) instead of scrolling as a
 * whole page.
 */
export default function ContentWrapper({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`content-wrapper${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
