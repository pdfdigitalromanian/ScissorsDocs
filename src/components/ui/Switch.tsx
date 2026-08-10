import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import './selection.css'

interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: ReactNode
  switchRef?: React.Ref<HTMLInputElement>
}

export default function Switch({
  label,
  id,
  className = '',
  disabled = false,
  switchRef,
  ...rest
}: SwitchProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <label
      className={`switch${disabled ? ' switch--disabled' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <input
        ref={switchRef}
        id={inputId}
        type="checkbox"
        role="switch"
        className="switch__input visually-hidden"
        disabled={disabled}
        {...rest}
      />
      <span className="switch__track" aria-hidden="true" />
      {label && <span>{label}</span>}
    </label>
  )
}
