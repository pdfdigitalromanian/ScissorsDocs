import type { ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui'
import { LocalDocumentPreview } from '@/features/pdf'
import { downloadDocument, downloadDocumentCopy } from '@/features/documents'
import type { DocumentTab } from '../types'
import { DOCUMENT_PANEL_ID, getTabElementId } from '../config'
import { EmptyWorkspaceView } from './EmptyWorkspaceView'

interface DocumentContainerProps {
  activeTab: DocumentTab | null
  children?: ReactNode
}

/**
 * DocumentContainer is the tabbed surface for the active document. With no
 * active tab it renders the empty workspace view. Local documents render a
 * real preview; other sessions reserve the viewer slot.
 */
export function DocumentContainer({
  activeTab,
  children,
}: DocumentContainerProps) {
  const { toast } = useToast()

  if (!activeTab) {
    return <EmptyWorkspaceView />
  }

  const localDocument = activeTab.localDocument

  async function handleSaveCopy() {
    if (!localDocument) return
    const error = await downloadDocumentCopy(localDocument.id)
    if (error) {
      toast({
        title: 'Could not save a copy',
        description: error,
        variant: 'error',
      })
      return
    }
    toast({
      title: 'Copy saved',
      description: `${localDocument.name} was downloaded as a new copy.`,
      variant: 'success',
    })
  }

  return (
    <div
      id={DOCUMENT_PANEL_ID}
      role="tabpanel"
      aria-labelledby={getTabElementId(activeTab.id)}
      tabIndex={0}
      className="document-container"
    >
      <div className="document-container__header">
        <h2 className="document-container__title">{activeTab.title}</h2>
        {activeTab.subtitle && (
          <span className="document-container__subtitle">
            {activeTab.subtitle}
          </span>
        )}
        {localDocument && (
          <span className="document-container__actions">
            <IconButton
              icon="download"
              label={`Download ${activeTab.title}`}
              iconSize="sm"
              onClick={() => void downloadDocument(localDocument.id)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSaveCopy()}
            >
              <Icon name="copy" size="sm" aria-hidden="true" />
              Save a copy
            </Button>
          </span>
        )}
      </div>
      <div className="document-container__surface">
        {localDocument ? (
          <LocalDocumentPreview document={localDocument} />
        ) : (
          children ?? (
            <div
              className="document-placeholder"
              role="region"
              aria-label="Document viewer"
            >
              <Icon name="file-text" size="xl" />
              <span className="document-placeholder__label">
                {activeTab.extension ? `${activeTab.extension} Viewer` : 'Viewer'}
              </span>
              <p className="document-placeholder__hint">
                This sample session is reserved; its viewer arrives with the
                next milestones.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
