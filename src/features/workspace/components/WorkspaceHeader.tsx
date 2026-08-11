import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Badge from '@/components/ui/Badge'
import Breadcrumb from '@/components/ui/Breadcrumb'
import Button from '@/components/ui/Button'
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import {
  deleteDocument,
  downloadDocument,
  downloadDocumentCopy,
} from '@/features/documents'
import { DOCUMENT_STATUS_LABEL } from '../types'
import type { DocumentStatus } from '../types'
import { useWorkspace } from '../state/use-workspace'

const STATUS_TONE: Record<DocumentStatus, 'success' | 'info' | 'warning'> = {
  ready: 'success',
  processing: 'info',
  syncing: 'warning',
}

/**
 * WorkspaceHeader — breadcrumb trail plus the active document's identity,
 * a real save status (local persistence + auto-saved session) and a real
 * actions menu (download, save a copy, move to trash).
 */
export function WorkspaceHeader() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { activeTab } = useWorkspace()
  const [trashTarget, setTrashTarget] = useState(false)

  const localDocument = activeTab?.localDocument

  const items = [
    { label: 'Home', to: '/', icon: 'home' as const },
    { label: 'Documents', to: '/recent', icon: 'file' as const },
    { label: activeTab ? activeTab.title : 'Workspace' },
  ]

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

  async function handleMoveToTrash() {
    if (!localDocument) return
    await deleteDocument(localDocument.id)
    toast({
      title: 'Moved to trash',
      description: `${localDocument.name} was moved to the trash and can be restored.`,
      variant: 'info',
    })
    setTrashTarget(false)
    navigate('/recent')
  }

  return (
    <header className="workspace-header">
      <Breadcrumb items={items} className="workspace-header__breadcrumb" />
      {activeTab && (
        <div className="workspace-header__document">
          <span className="workspace-header__icon" aria-hidden="true">
            <Icon name={activeTab.icon ?? 'file-text'} size="sm" />
          </span>
          <span className="workspace-header__name">{activeTab.title}</span>
          {activeTab.status && (
            <Badge tone={STATUS_TONE[activeTab.status]} size="sm" dot>
              {DOCUMENT_STATUS_LABEL[activeTab.status]}
            </Badge>
          )}
          {localDocument && (
            <span className="workspace-header__save">
              <Icon name="check-circle" size="xs" />
              Saved on this device
            </span>
          )}
          {localDocument && (
            <Dropdown align="end">
              <DropdownTrigger
                className="workspace-header__actions"
                aria-label={`Actions for ${activeTab.title}`}
              >
                <Icon name="menu" size="sm" />
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem
                  icon="download"
                  onSelect={() => void downloadDocument(localDocument.id)}
                >
                  Download
                </DropdownItem>
                <DropdownItem
                  icon="upload"
                  onSelect={() => void handleSaveCopy()}
                >
                  Save a copy
                </DropdownItem>
                <DropdownItem
                  icon="trash"
                  danger
                  onSelect={() => setTrashTarget(true)}
                >
                  Move to trash
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}
        </div>
      )}

      {localDocument && (
        <Modal
          open={trashTarget}
          onClose={() => setTrashTarget(false)}
          size="sm"
        >
          <ModalHeader>
            <ModalTitle>Move to trash?</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <p className="workspace-header__trash-message">
              {localDocument.name} will be moved to the trash. You can restore
              it later from the Recent or Favorites pages.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setTrashTarget(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleMoveToTrash()}>
              Move to trash
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </header>
  )
}
