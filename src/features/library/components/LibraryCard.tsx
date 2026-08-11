import { Icon } from '@/components/icons/Icon'
import {
  findFileType,
  formatBytes,
  formatRelativeTime,
} from '@/features/documents'
import type { LocalDocument, LocalFolder } from '@/features/documents'
import { DocumentActionsMenu } from './DocumentActionsMenu'
import type { DocumentMenuHandlers } from './document-menu'

interface LibraryCardProps {
  document: LocalDocument
  folders: LocalFolder[]
  handlers: DocumentMenuHandlers
  /** Overrides the last-opened label (used in the trash view). */
  metaLabel?: string
}

/**
 * LibraryCard — a library document entry. The whole card opens the
 * document; right-click or the "more" button expose the full lifecycle
 * actions (duplicate, rename, favorite, pin, tags, move, trash).
 */
export function LibraryCard({
  document,
  folders,
  handlers,
  metaLabel,
}: LibraryCardProps) {
  const fileType = findFileType({
    name: document.name,
    type: document.mimeType,
  })
  const folder = folders.find((entry) => entry.id === document.folderId)

  return (
    <DocumentActionsMenu document={document} handlers={handlers}>
      <article className="library-card">
        <button
          type="button"
          className="library-card__open"
          onClick={handlers.onOpen}
        >
          <span
            className={`home-icon home-icon--${fileType?.tone ?? 'secondary'}`}
            aria-hidden="true"
          >
            <Icon name={fileType?.icon ?? 'file'} size="lg" />
          </span>
          <span className="library-card__body">
            <span className="library-card__name">
              {document.name}
              {document.pin ? (
                <span className="library-card__flag" title="Pinned">
                  <Icon name="pin" size="xs" />
                </span>
              ) : null}
            </span>
            <span className="library-card__meta">
              <span
                className={`document-card__badge document-card__badge--${fileType?.tone ?? 'secondary'}`}
              >
                {document.extension.toUpperCase()}
              </span>
              <span>
                {formatBytes(document.size)} ·{' '}
                {metaLabel ??
                  formatRelativeTime(
                    document.deletedAt != null
                      ? document.deletedAt
                      : document.lastOpenedAt,
                  )}
              </span>
              {folder ? <span>· {folder.name}</span> : null}
            </span>
            {document.tags.length > 0 ? (
              <span className="library-card__tags" aria-label="Tags">
                {document.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="library-card__tag">
                    {tag}
                  </span>
                ))}
                {document.tags.length > 3 ? (
                  <span className="library-card__tag">
                    +{document.tags.length - 3}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </button>
      </article>
    </DocumentActionsMenu>
  )
}
