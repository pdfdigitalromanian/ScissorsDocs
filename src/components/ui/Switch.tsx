import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './selection.css'

interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'onChange'
> {
  label?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

export default function Switch({
  label,
  checked,
  onChange,
  className = '',
  disabled = false,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch${disabled ? ' switch--disabled' : ''}${
        className ? ` ${className}` : ''
      }`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="switch__track" aria-hidden="true" />
      {label && <span>{label}</span>}
    </button>
  )
}
