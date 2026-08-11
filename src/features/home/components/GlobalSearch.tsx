import { useState } from 'react'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import {
  deleteDocument,
  findFileType,
  formatBytes,
  formatRelativeTime,
  searchLocalDocuments,
  setFavorite,
  useLocalDocuments,
} from '@/features/documents'
import type { LocalDocument } from '@/features/documents'
import HomeSection from './HomeSection'
import DocumentCard from './DocumentCard'
import type { DocumentCardItem } from './DocumentCard'

function toCardItem(document: LocalDocument): DocumentCardItem {
  const fileType = findFileType({ name: document.name, type: document.mimeType })
  return {
    id: document.id,
    name: document.name,
    extension: document.extension.toUpperCase(),
    sizeLabel: formatBytes(document.size),
    lastOpenedLabel: formatRelativeTime(document.lastOpenedAt),
    tone: fileType?.tone ?? 'secondary',
    icon: fileType?.icon,
    favorite: document.favorite,
  }
}

/**
 * GlobalSearch — real local search over file names, folder names, tags and
 * file types. Results open directly in the workspace.
 */
export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const hasQuery = trimmed.length > 0

  // Subscribes to the local registry so search always sees current data.
  useLocalDocuments()
  const results = searchLocalDocuments(trimmed)

  return (
    <HomeSection
      title="Search"
      description="Find documents by name, folder, tag or file type."
    >
      <div className="home-search">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          label="Search the workspace"
          placeholder="Search names, folders, tags and file types"
          clearable
        />
        <div className="home-search__results" aria-live="polite">
          {hasQuery ? (
            results.length === 0 ? (
              <EmptyState
                icon="search"
                title="No results found"
                description={`Nothing matches “${trimmed}”. Try a different name, folder, tag or file type.`}
              />
            ) : (
              <div className="home-documents">
                {results.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={toCardItem(document)}
                    onToggleFavorite={() =>
                      void setFavorite(document.id, !document.favorite)
                    }
                    onRemove={() => void deleteDocument(document.id)}
                  />
                ))}
              </div>
            )
          ) : (
            <EmptyState
              icon="search"
              title="Search across your documents"
              description="Start typing to search names, folders, tags and file types."
            />
          )}
        </div>
      </div>
    </HomeSection>
  )
}
