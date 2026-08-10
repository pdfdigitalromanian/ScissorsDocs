import { useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import './inputs.css'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  textareaRef?: React.Ref<HTMLTextAreaElement>
}

export default function Textarea({
  label,
  hint,
  error,
  id,
  rows = 4,
  textareaRef,
  className = '',
  ...rest
}: TextareaProps) {
  const autoId = useId()
  const textareaId = id ?? autoId
  const hintId = `${textareaId}-hint`
  const errorId = `${textareaId}-error`

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      {label && (
        <label className="field__label" htmlFor={textareaId}>
          {label}
        </label>
      )}
      <textarea
        ref={textareaRef}
        id={textareaId}
        rows={rows}
        className={`textarea${error ? ' textarea--error' : ''}`}
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
