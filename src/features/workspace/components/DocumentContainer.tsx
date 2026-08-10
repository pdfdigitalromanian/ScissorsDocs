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
 */
export function DocumentContainer({
  activeTab,
  children,
}: DocumentContainerProps) {
  if (!activeTab) {
    return <EmptyWorkspaceView />
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
      </div>
      <div className="document-container__surface">
        {activeTab.localDocument ? (
          <LocalDocumentPreview document={activeTab.localDocument} />
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
