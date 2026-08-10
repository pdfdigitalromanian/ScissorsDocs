import type { HTMLAttributes } from 'react'
import './layout-utilities.css'

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  label?: string
}

/**
 * Separator renders a semantic rule that divides content regions.
 * Defaults to a decorative separator; pass a label to name it.
 */
export default function Separator({
  orientation = 'horizontal',
  label,
  className = '',
  ...rest
}: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      className={`separator separator--${orientation}${
        className ? ` ${className}` : ''
      }`}
      {...rest}
    />
  )
}
