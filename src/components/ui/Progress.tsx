import './feedback.css'

type ProgressTone = 'default' | 'success' | 'warning' | 'error'

interface ProgressProps {
  value?: number
  max?: number
  indeterminate?: boolean
  label?: string
  showValue?: boolean
  tone?: ProgressTone
  valueLabel?: string
  className?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export default function Progress({
  value = 0,
  max = 100,
  indeterminate = false,
  label,
  showValue = false,
  tone = 'default',
  valueLabel,
  className = '',
}: ProgressProps) {
  const safeMax = max <= 0 ? 100 : max
  const normalized = clamp(value, 0, safeMax)
  const percent = Math.round((normalized / safeMax) * 100)

  return (
    <div
      className={`progress${tone !== 'default' ? ` progress--${tone}` : ''}${
        className ? ` ${className}` : ''
      }`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={indeterminate ? undefined : normalized}
      aria-valuetext={indeterminate ? undefined : valueLabel}
    >
      {(label || showValue) && (
        <div className="progress__meta">
          {label && <span className="progress__label">{label}</span>}
          {showValue && !indeterminate && (
            <span className="progress__value">
              {valueLabel ?? `${percent}%`}
            </span>
          )}
        </div>
      )}
      <div className="progress__track">
        <div
          className={`progress__fill${
            indeterminate ? ' progress__fill--indeterminate' : ''
          }`}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
