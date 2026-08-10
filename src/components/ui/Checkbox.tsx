import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import './selection.css'

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: ReactNode
  indeterminate?: boolean
}

export default function Checkbox({
  label,
  id,
  className = '',
  disabled = false,
  indeterminate = false,
  ...rest
}: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <label
      className={`checkbox${disabled ? ' checkbox--disabled' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <input
        ref={(input) => {
          if (input) input.indeterminate = indeterminate
        }}
        id={inputId}
        type="checkbox"
        className="checkbox__input visually-hidden"
        disabled={disabled}
        {...rest}
      />
      <span className="checkbox__box" aria-hidden="true">
        <Icon name="check" size="xs" className="checkbox__icon" />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}
