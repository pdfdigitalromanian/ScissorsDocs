import { Link } from 'react-router-dom'
import {
  deleteDocument,
  downloadDocument,
  findFileType,
  formatBytes,
  formatRelativeTime,
  setFavorite,
  useLocalDocuments,
} from '@/features/documents'
import type { LocalDocument } from '@/features/documents'
import HomeSection from './HomeSection'
import DocumentCard from './DocumentCard'
import type { DocumentCardItem } from './DocumentCard'
import EmptyState from '@/components/ui/EmptyState'

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
    favorite: true,
  }
}

/**
 * FavoriteDocumentsSection lists the local documents the user marked as
 * favorites. Cards open the document and can un-favorite it directly.
 */
export default function FavoriteDocumentsSection() {
  const documents = useLocalDocuments().filter((document) => document.favorite)

  return (
    <HomeSection
      id="favorites"
      title="Favorites"
      description="Documents you mark as favorites stay one tap away."
      action={
        <Link className="home-section__link" to="/favorites">
          View all
        </Link>
      }
    >
      {documents.length === 0 ? (
        <div className="home-collection">
          <EmptyState
            icon="favorites"
            title="No favorites yet"
            description="Mark documents as favorites to keep them within reach."
            headingLevel="h3"
          />
        </div>
      ) : (
        <div className="home-documents">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={toCardItem(document)}
              onDownload={() => void downloadDocument(document.id)}
              onRemove={() => void deleteDocument(document.id)}
              onToggleFavorite={() =>
                void setFavorite(document.id, false)
              }
            />
          ))}
        </div>
      )}
    </HomeSection>
  )
}
