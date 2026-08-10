import { useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/components/ui'
import { clearLocalDocuments } from '@/features/documents'
import { OpenDocumentButton } from './OpenDocumentButton'
import {
  clearWorkspaceState,
  getRestorePreference,
  setRestorePreference,
} from '../persistence/workspace-store'
import { useWorkspace } from '../state/use-workspace'

/**
 * EmptyWorkspaceView guides the user toward opening a document when the
 * workspace has no active session. It also hosts the workspace
 * preferences: restoring the previous session and clearing all locally
 * stored data.
 */
export function EmptyWorkspaceView() {
  const { toast } = useToast()
  const { resetWorkspace } = useWorkspace()
  const [restoreEnabled, setRestoreEnabled] = useState(getRestorePreference())

  const handleRestoreToggle = (enabled: boolean) => {
    setRestoreEnabled(enabled)
    setRestorePreference(enabled)
    toast({
      title: enabled ? 'Workspace restore enabled' : 'Workspace restore disabled',
      description: enabled
        ? 'Your workspace will reopen as you left it on your next visit.'
        : 'Your workspace will start empty on your next visit.',
      variant: 'info',
    })
  }

  const handleClearWorkspace = () => {
    const confirmed = window.confirm(
      'Remove every locally stored document and clear the workspace? ' +
        'Files added in this browser will be deleted. This cannot be undone.',
    )
    if (!confirmed) return
    void (async () => {
      try {
        await Promise.all([clearLocalDocuments(), clearWorkspaceState()])
        resetWorkspace()
        toast({
          title: 'Workspace cleared',
          description: 'All local documents and workspace data were removed.',
          variant: 'success',
        })
      } catch {
        toast({
          title: 'Could not clear workspace',
          description: 'Some local data could not be removed.',
          variant: 'error',
        })
      }
    })()
  }

  return (
    <EmptyState
      icon="workspace"
      title="No document open"
      description="Open a document from this device to start working inside the workspace."
      action={
        <div className="empty-workspace__actions">
          <OpenDocumentButton label="Open Document" variant="primary" />
          <div className="empty-workspace__settings">
            <Switch
              checked={restoreEnabled}
              onChange={(event) => handleRestoreToggle(event.target.checked)}
              label="Reopen the workspace as you left it"
            />
            <span className="empty-workspace__settings-divider" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={handleClearWorkspace}>
              Clear Local Workspace
            </Button>
          </div>
        </div>
      }
    />
  )
}
