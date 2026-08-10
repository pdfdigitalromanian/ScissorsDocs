import type { HTMLAttributes } from 'react'
import './layout-utilities.css'

export type ResponsiveContainerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'page'

interface ResponsiveContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: ResponsiveContainerSize
  fluid?: boolean
}

/**
 * ResponsiveContainer centers content within a token-based max-width
 * and adjusts gutters across breakpoints.
 */
export default function ResponsiveContainer({
  size = 'page',
  fluid = false,
  className = '',
  ...rest
}: ResponsiveContainerProps) {
  const classes = [
    'responsive-container',
    fluid ? 'responsive-container--fluid' : `responsive-container--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes} {...rest} />
}
