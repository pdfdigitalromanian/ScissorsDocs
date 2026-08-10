import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import type { IconName } from '@/components/icons/Icon'
import HomeSection from './HomeSection'

interface DocumentCollectionSectionProps {
  id?: string
  title: string
  description: string
  icon: IconName
  emptyTitle: string
  emptyDescription: string
  emptyAction: ReactNode
  viewAllHref: string
}

/**
 * DocumentCollectionSection — shared empty-state section used by the
 * Recent Documents and Favorites areas. Persistence is intentionally not
 * implemented in this milestone; each section presents an elegant empty
 * state and a "View all" escape hatch to its dedicated route.
 */
export default function DocumentCollectionSection({
  id,
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  viewAllHref,
}: DocumentCollectionSectionProps) {
  return (
    <HomeSection
      id={id}
      title={title}
      description={description}
      action={
        <Link className="home-section__link" to={viewAllHref}>
          View all
        </Link>
      }
    >
      <div className="home-collection">
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    </HomeSection>
  )
}
