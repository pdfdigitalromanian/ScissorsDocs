import { Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import HomeSection from './HomeSection'
import { homeQuickStart } from '../data/home-catalog'
import type { HomeQuickStart } from '../data/home-catalog'

function QuickStartCard({ action }: { action: HomeQuickStart }) {
  const { toast } = useToast()

  const inner = (
    <>
      <span className={`home-icon home-icon--${action.tone}`} aria-hidden="true">
        <Icon name={action.icon} size="lg" />
      </span>
      <span className="quick-start-card__body">
        <span className="quick-start-card__label">{action.label}</span>
        <span className="quick-start-card__description">
          {action.description}
        </span>
      </span>
      <Icon
        name="arrow-right"
        size="sm"
        className="quick-start-card__arrow"
        aria-hidden="true"
      />
    </>
  )

  if (action.to) {
    return (
      <Link className="quick-start-card" to={action.to}>
        {inner}
      </Link>
    )
  }

  function handleActivate() {
    toast({
      title: action.label,
      description: action.hint,
      variant: 'info',
    })
  }

  return (
    <button type="button" className="quick-start-card" onClick={handleActivate}>
      {inner}
    </button>
  )
}

/**
 * QuickStartSection surfaces the most common document workflows as
 * entry cards. Navigation targets route to their placeholder screens;
 * the rest are UI-only in this milestone.
 */
export default function QuickStartSection() {
  return (
    <HomeSection
      title="Quick start"
      description="Launch the most common document workflows."
    >
      <div className="home-quick-start">
        {homeQuickStart.map((action) => (
          <QuickStartCard key={action.id} action={action} />
        ))}
      </div>
    </HomeSection>
  )
}
