import EmptyState from '@/components/ui/EmptyState'
import { OpenDocumentButton } from './OpenDocumentButton'

/**
 * EmptyWorkspaceView guides the user toward opening a document when the
 * workspace has no active session.
 */
export function EmptyWorkspaceView() {
  return (
    <EmptyState
      icon="workspace"
      title="No document open"
      description="Open a document from this device to start working inside the workspace."
      action={
        <div className="empty-workspace__actions">
          <OpenDocumentButton
            label="Open Document"
            variant="primary"
            className="empty-workspace__open"
          />
        </div>
      }
    />
  )
}
