import HomeSection from './HomeSection'
import QuickActionCard from './QuickActionCard'
import { homeQuickActions } from '../data/home-catalog'

/**
 * QuickActionsSection — the most common document tasks, surfaced first
 * on the landing page for one-tap access.
 */
export default function QuickActionsSection() {
  return (
    <HomeSection
      title="Quick actions"
      description="Start common document tasks right from the home screen."
    >
      <div className="home-quick-actions">
        {homeQuickActions.map((action) => (
          <QuickActionCard key={action.id} action={action} />
        ))}
      </div>
    </HomeSection>
  )
}
