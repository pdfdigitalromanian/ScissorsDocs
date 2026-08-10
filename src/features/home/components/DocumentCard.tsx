import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import IconButton from '@/components/ui/IconButton'
import type { DocumentTone } from '@/features/documents'

export interface DocumentCardItem {
  id: string
  name: string
  extension: string
  sizeLabel: string
  lastOpenedLabel: string
  tone: DocumentTone
  icon?: IconName
}

interface DocumentCardProps {
  document: DocumentCardItem
  onDownload?: () => void
  onRemove?: () => void
}

/**
 * DocumentCard — entry card for a registered local document. The main
 * surface opens the document into a workspace session; optional actions
 * download or remove the local copy.
 */
export default function DocumentCard({
  document,
  onDownload,
  onRemove,
}: DocumentCardProps) {
  const navigate = useNavigate()

  function handleOpen() {
    navigate(`/workspace?doc=${encodeURIComponent(document.id)}`)
  }

  return (
    <div className="document-card">
      <button
        type="button"
        className="document-card__open"
        onClick={handleOpen}
      >
        <span
          className={`home-icon home-icon--${document.tone}`}
          aria-hidden="true"
        >
          <Icon name={document.icon ?? 'file'} size="lg" />
        </span>
        <span className="document-card__body">
          <span className="document-card__name">{document.name}</span>
          <span className="document-card__meta">
            <span
              className={`document-card__badge document-card__badge--${document.tone}`}
            >
              {document.extension}
            </span>
            <span>
              {document.sizeLabel} · {document.lastOpenedLabel}
            </span>
          </span>
        </span>
      </button>
      {onDownload || onRemove ? (
        <span className="document-card__actions">
          {onDownload ? (
            <IconButton
              icon="download"
              label={`Download ${document.name}`}
              iconSize="sm"
              className="document-card__action"
              onClick={(event) => {
                event.stopPropagation()
                onDownload()
              }}
            />
          ) : null}
          {onRemove ? (
            <IconButton
              icon="trash"
              label={`Remove ${document.name}`}
              iconSize="sm"
              className="document-card__action document-card__action--danger"
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
            />
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
