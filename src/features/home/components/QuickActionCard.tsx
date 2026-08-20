import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import type { HomeQuickAction } from '../data/home-catalog'

interface QuickActionCardProps {
  action: HomeQuickAction
}

/**
 * QuickActionCard — tappable card for a common document task.
 * Actions with a `to` target route to the real tool page; the remaining
 * actions stay honest about their availability via a toast.
 */
export default function QuickActionCard({ action }: QuickActionCardProps) {
  const navigate = useNavigate()
  const { toast } = useToast()

  function handleActivate() {
    if (action.to) {
      navigate(action.to)
      return
    }
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