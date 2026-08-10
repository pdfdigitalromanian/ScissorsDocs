import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { PdfSessionProvider } from '@/features/pdf'
import { useLocalDocumentBlob } from '@/features/documents'
import { getLocalDocument, touchDocument } from '@/features/documents'
import { RESERVED_REGIONS } from '../config'
import { useWorkspace } from '../state/use-workspace'
import { useWorkspaceShortcuts } from '../interaction/workspace-interactions'
import { useWorkspacePersistence } from '../persistence/use-workspace-persistence'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { DocumentTabs } from './DocumentTabs'
import { WorkspacePanel } from './WorkspacePanel'
import { PanelResizeHandle } from './PanelResizeHandle'
import { WorkspaceCanvas } from './WorkspaceCanvas'
import { DocumentContainer } from './DocumentContainer'
import { FloatingPanelRegion } from './FloatingPanelRegion'
import { WorkspaceProvider } from '../state/workspace-provider'
import '../workspace.css'

interface WorkspaceAreaProps {
  /** Local document id to open into a session when the workspace mounts. */
  initialDocumentId?: string
}

/**
 * PdfSessionHost loads the active local PDF's file blob and shares the
 * pdf.js session with the main viewer and the thumbnail panel. Other
 * session types receive an empty (idle) session.
 */
function PdfSessionHost({ children }: { children: ReactNode }) {
  const { activeTab } = useWorkspace()
  const localDocument = activeTab?.localDocument
  const isPdf = localDocument?.kind === 'pdf'
  const { state, blob } = useLocalDocumentBlob(isPdf ? localDocument.id : undefined)

  return (
    <PdfSessionProvider
      documentId={isPdf ? localDocument.id : undefined}
      blob={state === 'ready' ? blob : null}
    >
      {children}
    </PdfSessionProvider>
  )
}

function WorkspaceAreaInner({ initialDocumentId }: WorkspaceAreaProps) {
  useWorkspaceShortcuts()
  useWorkspacePersistence()
  const { panels, tabs, activeTab, openLocalDocument } = useWorkspace()

  useEffect(() => {
    if (!initialDocumentId) return
    let cancelled = false
    void getLocalDocument(initialDocumentId)
      .then((document) => {
        if (cancelled || !document) return
        void touchDocument(document.id)
        openLocalDocument(document)
      })
    return () => {
      cancelled = true
    }
  }, [initialDocumentId, openLocalDocument])

  return (
    <PdfSessionHost>
      <div
        role="region"
        aria-label="Document workspace"
        className="workspace-area"
      >
        <div className="workspace-area__header">
          <WorkspaceHeader />
        </div>

        <div className="workspace-area__toolbar">
          <WorkspaceToolbar />
        </div>

        {tabs.length > 0 && (
          <div className="workspace-area__tabs">
            <DocumentTabs />
          </div>
        )}

        <div className="workspace-area__main">
          {panels.left !== 'hidden' && <WorkspacePanel panel="left" />}
          {panels.left === 'open' && (
            <PanelResizeHandle panel="left" label="Resize pages panel" />
          )}
          <div className="workspace-area__stage">
            <WorkspaceCanvas>
              <DocumentContainer activeTab={activeTab} />
            </WorkspaceCanvas>
          </div>
          {panels.inspector === 'open' && (
            <PanelResizeHandle panel="inspector" label="Resize inspector panel" />
          )}
          {panels.inspector !== 'hidden' && <WorkspacePanel panel="inspector" />}
        </div>

        {panels.bottom !== 'hidden' && (
          <div className="workspace-area__bottom">
            {panels.bottom === 'open' && (
              <PanelResizeHandle panel="bottom" label="Resize bottom panel" />
            )}
            <WorkspacePanel panel="bottom" />
          </div>
        )}

        {RESERVED_REGIONS.map((region) => {
          if (!region.floatingPlacement) return null
          return (
            <FloatingPanelRegion
              key={region.id}
              region={region.id}
              title={region.label}
              placement={region.floatingPlacement}
            />
          )
        })}
      </div>
    </PdfSessionHost>
  )
}

/**
 * WorkspaceArea is the self-contained workspace surface: header, toolbar,
 * document tabs, resizable panels, the document canvas and reserved floating
 * regions. It owns the workspace state and interaction framework.
 */
export function WorkspaceArea({ initialDocumentId }: WorkspaceAreaProps) {
  return (
    <WorkspaceProvider>
      <WorkspaceAreaInner initialDocumentId={initialDocumentId} />
    </WorkspaceProvider>
  )
}
