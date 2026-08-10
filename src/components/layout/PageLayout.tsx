import type { HTMLAttributes } from 'react'
import './layout-page.css'

/**
 * PageLayout is the root of a routed page. It fills the main content
 * area and provides whole-page scrolling.
 */
export default function PageLayout({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`page-layout${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
