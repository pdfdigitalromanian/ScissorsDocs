import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import './selection.css'

interface RadioProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: ReactNode
}

export default function Radio({
  label,
  id,
  className = '',
  disabled = false,
  ...rest
}: RadioProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <label
      className={`radio${disabled ? ' radio--disabled' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <input
        id={inputId}
        type="radio"
        className="radio__input visually-hidden"
        disabled={disabled}
        {...rest}
      />
      <span className="radio__circle" aria-hidden="true" />
      {label && <span>{label}</span>}
    </label>
  )
}
