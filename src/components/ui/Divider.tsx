import type { ReactNode } from 'react'
import './display.css'

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  label?: ReactNode
  className?: string
}

export default function Divider({
  orientation = 'horizontal',
  label,
  className = '',
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={`divider divider--vertical${className ? ` ${className}` : ''}`}
      />
    )
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={`divider${className ? ` ${className}` : ''}`}
    >
      <span className="divider__line" aria-hidden="true" />
      {label && <span className="divider__label">{label}</span>}
      {label && <span className="divider__line" aria-hidden="true" />}
    </div>
  )
}
