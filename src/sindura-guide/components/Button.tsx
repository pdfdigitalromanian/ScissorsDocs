import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'danger'

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
      className={`sg-btn sg-btn--${variant} sg-btn--${size}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}
