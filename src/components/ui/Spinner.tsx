import type { HTMLAttributes } from 'react'
import './feedback.css'

type SpinnerSize = 'sm' | 'md' | 'lg'

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize
  label?: string
}

export default function Spinner({
  size = 'md',
  label = 'Loading',
  className = '',
  ...rest
}: SpinnerProps) {
  return (
    <span
      className={`spinner spinner--${size}${className ? ` ${className}` : ''}`}
      role="status"
      {...rest}
    >
      <span className="visually-hidden">{label}</span>
    </span>
  )
}
