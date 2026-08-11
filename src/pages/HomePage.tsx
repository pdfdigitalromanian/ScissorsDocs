import {
  DocumentEntrySection,
  FavoriteDocumentsSection,
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
      <FavoriteDocumentsSection />
      <GlobalSearch />
    </div>
  )
}
