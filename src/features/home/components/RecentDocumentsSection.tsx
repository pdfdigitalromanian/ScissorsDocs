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
  downloadDocument,
  findFileType,
  formatBytes,
  formatRelativeTime,
  removeDocument,
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
    await removeDocument(pendingRemoval.id)
    toast({
      title: 'Document removed',
      description: `${pendingRemoval.name} was removed from ScissorsDoc.`,
      variant: 'success',
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
          <ModalTitle>Remove document?</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="document-remove__message">
            {pendingRemoval?.name} will be removed from ScissorsDoc. Your
            original file stays on your device.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setPendingRemoval(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void confirmRemoval()}>
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </HomeSection>
  )
}
