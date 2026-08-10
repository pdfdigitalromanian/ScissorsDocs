import { Link } from 'react-router-dom'
import {
  DocumentCollectionSection,
  DocumentEntrySection,
  GlobalSearch,
  HeroSection,
  QuickActionsSection,
  QuickStartSection,
  RecentDocumentsSection,
  ToolCategories,
} from '@/features/home'
import '@/features/home/home.css'

export default function HomePage() {
  return (
    <div className="home-page page-enter">
      <HeroSection />
      <DocumentEntrySection />
      <QuickActionsSection />
      <QuickStartSection />
      <ToolCategories />
      <RecentDocumentsSection />
      <DocumentCollectionSection
        id="favorites"
        title="Favorites"
        description="Documents you mark as favorites stay one tap away."
        icon="favorites"
        emptyTitle="No favorites yet"
        emptyDescription="Mark documents as favorites to keep them within reach."
        emptyAction={
          <Link className="home-section__link" to="/favorites">
            Browse favorites
          </Link>
        }
        viewAllHref="/favorites"
      />
      <GlobalSearch />
    </div>
  )
}
