import type { CSSProperties, HTMLAttributes } from 'react'
import './layout-utilities.css'

export type SpacerSize = number

interface SpacerProps extends HTMLAttributes<HTMLDivElement> {
  size?: SpacerSize
  axis?: 'horizontal' | 'vertical'
  flexible?: boolean
}

/**
 * Spacer inserts fixed (token-based) or flexible space between layout
 * regions. Rendered as an invisible element excluded from assistive tech.
 */
export default function Spacer({
  size = 4,
  axis = 'vertical',
  flexible = false,
  style,
  className = '',
  ...rest
}: SpacerProps) {
  const dimension = axis === 'horizontal' ? 'width' : 'height'
  const spacerStyle: CSSProperties | undefined = flexible
    ? style
    : { ...style, [dimension]: `var(--space-${size})` }

  return (
    <div
      aria-hidden="true"
      className={`spacer${flexible ? ' spacer--flexible' : ''}${
        className ? ` ${className}` : ''
      }`}
      style={spacerStyle}
      {...rest}
    />
  )
}
