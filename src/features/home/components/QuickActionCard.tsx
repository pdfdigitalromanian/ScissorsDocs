import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import type { HomeQuickAction } from '../data/home-catalog'

interface QuickActionCardProps {
  action: HomeQuickAction
}

/**
 * QuickActionCard — tappable card for a common document task.
 * Actions are UI-only in this milestone; activating one explains the
 * upcoming capability via a toast.
 */
export default function QuickActionCard({ action }: QuickActionCardProps) {
  const { toast } = useToast()

  function handleActivate() {
    toast({
      title: action.label,
      description: action.hint,
      variant: 'info',
    })
  }

  return (
    <button
      type="button"
      className="home-quick-action"
      onClick={handleActivate}
    >
      <span
        className={`home-icon home-icon--${action.tone}`}
        aria-hidden="true"
      >
        <Icon name={action.icon} size="lg" />
      </span>
      <span className="home-quick-action__text">
        <span className="home-quick-action__label">{action.label}</span>
        <span className="home-quick-action__description">
          {action.description}
        </span>
      </span>
      <Icon
        name="chevron-right"
        size="sm"
        className="home-quick-action__chevron"
        aria-hidden="true"
      />
    </button>
  )
}
