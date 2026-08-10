import type { IconName } from '@/components/icons/Icon'
import EmptyState from '@/components/ui/EmptyState'
import './pages.css'

interface PlaceholderPageProps {
  title: string
  description: string
  icon: IconName
}

export default function PlaceholderPage({
  title,
  description,
  icon,
}: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <EmptyState
        headingLevel="h1"
        icon={icon}
        title={title}
        description={description}
      />
    </div>
  )
}
