import { useCssVar } from './useCssVar'
import { getContrastColor } from './utils'

interface ColorSwatchProps {
  token: string
  label: string
  compact?: boolean
}

export default function ColorSwatch({
  token,
  label,
  compact = false,
}: ColorSwatchProps) {
  const value = useCssVar(token)

  return (
    <div
      className={`sg-swatch${compact ? ' sg-swatch--compact' : ''}`}
      style={{
        backgroundColor: `var(${token})`,
        color: getContrastColor(value),
      }}
      title={`var(${token})`}
    >
      <span className="sg-swatch__label">{label}</span>
      <span className="sg-swatch__value">{value || '—'}</span>
    </div>
  )
}
