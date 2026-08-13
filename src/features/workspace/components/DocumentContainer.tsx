import type { ReactNode } from 'react'
import { Icon } from '@/components/icons/Icon'
import { LocalDocumentPreview } from '@/features/pdf'
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
 *
 * PDFs render "flush" (no card padding/max-width/border) so the PDF
 * viewer's own toolbar and scroller can fill the entire workspace canvas
 * edge-to-edge; other preview kinds keep the centered card treatment.
 * This container has no header and no tools of its own — every
 * document-level action (edit text, edit content, document info,
 * download, page tools) lives in the workspace's fixed bottom action bar.
 */
export function DocumentContainer({
  activeTab,
  children,
}: DocumentContainerProps) {
  if (!activeTab) {
    return <EmptyWorkspaceView />
  }

  const localDocument = activeTab.localDocument
  const isPdf = localDocument?.kind === 'pdf'

  return (
    <div
      id={DOCUMENT_PANEL_ID}
      role="tabpanel"
      aria-labelledby={getTabElementId(activeTab.id)}
      tabIndex={0}
      className={`document-container${isPdf ? ' document-container--flush' : ''
        }`}
    >
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