import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui'
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
 * RecentDocumentsSection lists the documents registered locally on this
 * device. Cards open the document in the workspace and support download
 * and removal from the local registry.
 */
export default function RecentDocumentsSection() {
  const documents = useLocalDocuments()
  const { toast } = useToast()
  const [pendingRemoval, setPendingRemoval] = useState<LocalDocument | null>(
    null,
  )

  async function handleDownload(document: LocalDocument) {
    const error = await downloadDocument(document.id)
    if (error) {
      toast({ title: 'Download failed', description: error, variant: 'error' })
    }
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return
    await deleteDocument(pendingRemoval.id)
    toast({
      title: 'Moved to trash',
      description: `${pendingRemoval.name} was moved to the trash and can be restored.`,
      variant: 'info',
    })
    setPendingRemoval(null)
  }

  return (
    <HomeSection
      id="recent-documents"
      title="Recent documents"
      description="Pick up where you left off. Files stay on this device."
      action={
        <Link className="home-section__link" to="/recent">
          View all
        </Link>
      }
    >
      {documents.length === 0 ? (
        <div className="home-collection">
          <EmptyState
            icon="recent"
            title="No recent documents"
            description="Drop a file in the upload zone above to open it in the workspace."
            headingLevel="h3"
          />
        </div>
      ) : (
        <div className="home-documents">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={toCardItem(document)}
              onDownload={() => void handleDownload(document)}
              onRemove={() => setPendingRemoval(document)}
              onToggleFavorite={() =>
                void setFavorite(document.id, !document.favorite)
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>Move to trash?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="document-remove__message">
            {pendingRemoval?.name} will be moved to the trash. You can restore
            it later from the Recent or Favorites pages.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setPendingRemoval(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void confirmRemoval()}>
            Move to trash
          </Button>
        </ModalFooter>
      </Modal>
    </HomeSection>
  )
}
