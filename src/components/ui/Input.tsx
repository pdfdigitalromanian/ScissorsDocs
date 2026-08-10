import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import './inputs.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  inputRef?: React.Ref<HTMLInputElement>
}

export default function Input({
  label,
  hint,
  error,
  id,
  inputRef,
  className = '',
  ...rest
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      {label && (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        className={`input${error ? ' input--error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && !error && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
