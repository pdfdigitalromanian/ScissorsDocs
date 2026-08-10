import type { HTMLAttributes } from 'react'
import './layout-page.css'

export type PageContainerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: PageContainerSize
  flush?: boolean
}

/**
 * PageContainer centers and constrains page content with consistent
 * vertical rhythm and responsive gutters.
 */
export default function PageContainer({
  size,
  flush = false,
  className = '',
  ...rest
}: PageContainerProps) {
  const classes = [
    'page-container',
    size ? `page-container--${size}` : null,
    flush ? 'page-container--flush' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes} {...rest} />
}
