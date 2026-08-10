import { useState } from 'react'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import HomeSection from './HomeSection'

/**
 * GlobalSearch — presentation-only search interface. Search behaviour is
 * intentionally not implemented in this milestone; results render an
 * elegant empty state instead.
 */
export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const hasQuery = trimmed.length > 0

  return (
    <HomeSection
      title="Search"
      description="Find documents, tools and actions across the workspace."
    >
      <div className="home-search">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          label="Search the workspace"
          placeholder="Search documents, tools and actions"
          clearable
        />
        <div className="home-search__results" aria-live="polite">
          {hasQuery ? (
            <EmptyState
              icon="search"
              title="No results found"
              description={`Nothing matches “${trimmed}”. Try a different search.`}
            />
          ) : (
            <EmptyState
              icon="search"
              title="Search across everything"
              description="Start typing to search your documents, tools and actions."
            />
          )}
        </div>
      </div>
    </HomeSection>
  )
}
