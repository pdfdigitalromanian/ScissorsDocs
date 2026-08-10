import Badge from '@/components/ui/Badge'
import Breadcrumb from '@/components/ui/Breadcrumb'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import { DOCUMENT_STATUS_LABEL } from '../types'
import type { DocumentStatus } from '../types'
import { useWorkspace } from '../state/use-workspace'

const STATUS_TONE: Record<DocumentStatus, 'success' | 'info' | 'warning'> = {
  ready: 'success',
  processing: 'info',
  syncing: 'warning',
}

/**
 * WorkspaceHeader — breadcrumb trail plus the active document's identity:
 * icon, name, status, a save-status placeholder and an actions placeholder.
 * UI-only in this milestone; no action carries behavior.
 */
export function WorkspaceHeader() {
  const { activeTab } = useWorkspace()

  const items = [
    { label: 'Home', to: '/', icon: 'home' as const },
    { label: 'Documents', to: '/recent', icon: 'file' as const },
    { label: activeTab ? activeTab.title : 'Workspace' },
  ]

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
          <span className="workspace-header__save">
            <Icon name="check-circle" size="xs" />
            Save status placeholder
          </span>
          <IconButton
            icon="menu"
            label="Document actions"
            iconSize="sm"
            disabled
            className="workspace-header__actions"
          />
        </div>
      )}
    </header>
  )
}
