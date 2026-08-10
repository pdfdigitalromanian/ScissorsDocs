import type { ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import './ui.css'

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
  headingLevel?: HeadingLevel
}

export default function EmptyState({
  icon = 'file-text',
  title,
  description,
  action,
  headingLevel = 'h2',
}: EmptyStateProps) {
  const Heading = headingLevel

  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <Icon name={icon} size="xl" />
      </div>
      <Heading className="empty-state__title">{title}</Heading>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
