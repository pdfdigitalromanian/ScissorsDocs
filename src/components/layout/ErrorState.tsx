import type { ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import Button from '@/components/ui/Button'
import './layout-states.css'

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

interface ErrorStateProps {
  icon?: IconName
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  headingLevel?: HeadingLevel
  children?: ReactNode
  className?: string
}

/**
 * ErrorState is an alert placeholder shown when content fails to load.
 * It announces itself to assistive technology and may expose a single
 * retry action.
 */
export default function ErrorState({
  icon = 'alert-circle',
  title = 'Something went wrong',
  message,
  actionLabel,
  onAction,
  headingLevel = 'h2',
  children,
  className = '',
}: ErrorStateProps) {
  const Heading = headingLevel

  return (
    <div
      className={`error-state${className ? ` ${className}` : ''}`}
      role="alert"
    >
      <span className="error-state__icon" aria-hidden="true">
        <Icon name={icon} size="md" />
      </span>
      <Heading className="error-state__title">{title}</Heading>
      {message && <p className="error-state__message">{message}</p>}
      {children}
      {actionLabel && onAction && (
        <span className="error-state__action">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </span>
      )}
    </div>
  )
}
