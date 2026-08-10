import type { ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import './feedback.css'

type BadgeTone =
  'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  tone?: BadgeTone
  size?: BadgeSize
  dot?: boolean
  icon?: IconName
  children: ReactNode
  className?: string
}

export default function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  icon,
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`badge badge--${tone} badge--${size}${
        className ? ` ${className}` : ''
      }`}
    >
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {icon && <Icon name={icon} size="xs" />}
      {children}
    </span>
  )
}
