import type { ButtonHTMLAttributes } from 'react'
import './ui.css'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}
