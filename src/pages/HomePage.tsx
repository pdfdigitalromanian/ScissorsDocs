import { DocumentEntrySection } from '@/features/home'
import EntryHeader from '@/features/home/components/EntryHeader'
import '@/features/home/home.css'

export default function HomePage() {
  return (
    <div className="entry-page page-enter">
      <div className="entry-page__panel">
        <EntryHeader />
        <main id="main-content" className="entry-main" tabIndex={-1}>
          <section className="entry-hero" aria-labelledby="entry-title">
            <h1 id="entry-title" className="entry-hero__title">
              Every document tool.
              <span> One focused workspace.</span>
            </h1>
            <p className="entry-hero__description">
              Open, organize, and work with your files in one calm place. Your
              documents stay on your device.
            </p>
          </section>

          <DocumentEntrySection />
        </main>
      </div>
    </div>
  )
}
