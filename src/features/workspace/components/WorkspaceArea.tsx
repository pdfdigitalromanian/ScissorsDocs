import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { PdfSessionProvider } from '@/features/pdf'
import {
  PdfEditorProvider,
  usePdfEditor,
} from '@/features/editor/PdfEditorProvider'
import { stripElementStreamsFromBytes } from '@/features/editor/element-pdf'
import { ingestFiles, useLocalDocumentBlob } from '@/features/documents'
import { getLocalDocument, touchDocument } from '@/features/documents'
import { useToast } from '@/components/ui'
import { RESERVED_REGIONS } from '../config'
import { useWorkspace } from '../state/use-workspace'
import { useWorkspaceShortcuts } from '../interaction/workspace-interactions'
import { useWorkspacePersistence } from '../persistence/use-workspace-persistence'
import { DocumentTabs } from './DocumentTabs'
import { WorkspacePanel } from './WorkspacePanel'
import { PanelResizeHandle } from './PanelResizeHandle'
import { WorkspaceCanvas } from './WorkspaceCanvas'
import { DocumentContainer } from './DocumentContainer'
import { WorkspaceActionBar } from './WorkspaceActionBar'
import { FloatingPanelRegion } from './FloatingPanelRegion'
import { WorkspaceProvider } from '../state/workspace-provider'
import '../workspace.css'

interface WorkspaceAreaProps {
  /** Local document ids to open into sessions when the workspace mounts. */
  initialDocumentIds?: string[]
}

/**
 * EditorSessionHost feeds the editable blob to the shared pdf.js session.
 *
 * Structural edits (page insert/delete/reorder/rotate, undo/redo) refresh
 * the session immediately so the viewer and thumbnails stay synchronized.
 * While edit mode is ON the session receives a copy of the current bytes
 * with every tagged element content stream stripped, so the live element
 * overlay is the only thing painting the elements — otherwise the baked
 * element copy stays visible under the overlay as a ghost duplicate that
 * never tracks the dragged element. When edit mode is switched off the
 * baked blob (elements drawn into the page) is fed in instead.
 */
function EditorSessionHost({
  documentId,
  storedBlob,
  children,
}: {
  documentId: string | undefined
  storedBlob: Blob | null
  children: ReactNode
}) {
  const editor = usePdfEditor()
  const stripRequestRef = useRef(0)
  const [stripped, setStripped] = useState<{
    documentId: string | undefined
    version: number
    blob: Blob
  } | null>(null)

  /* Drop the stripped-bytes cache when the document changes so the next
   * edit session recomputes it from the new document's bytes. */
  const [documentKey, setDocumentKey] = useState<{
    id: string | undefined
    seen: boolean
  }>({ id: undefined, seen: false })
  if (!documentKey.seen || documentKey.id !== documentId) {
    setDocumentKey({ id: documentId, seen: true })
    setStripped(null)
  }

  const editingActive =
    editor.status === 'ready' && editor.editMode && editor.blob !== null

  const sessionBlob =
    editingActive &&
      stripped &&
      stripped.documentId === documentId &&
      stripped.version === editor.structuralVersion
      ? stripped.blob
      : editor.status === 'ready' && editor.blob
        ? editor.blob
        : storedBlob

  useEffect(() => {
    if (
      editor.status !== 'ready' ||
      !editor.editMode ||
      !editor.blob ||
      (stripped &&
        stripped.documentId === documentId &&
        stripped.version === editor.structuralVersion)
    ) {
      return
    }
    const request = ++stripRequestRef.current
    const source = editor.blob
    void (async () => {
      try {
        const bytes = await stripElementStreamsFromBytes(
          new Uint8Array(await source.arrayBuffer()),
        )
        if (request !== stripRequestRef.current) return
        setStripped({
          documentId,
          version: editor.structuralVersion,
          blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        })
      } catch {
        // The baked blob stays; the overlay renders the live elements.
      }
    })()
  }, [editor.status, editor.editMode, editor.blob, editor.structuralVersion, documentId, stripped])

  return (
    <PdfSessionProvider documentId={documentId} blob={sessionBlob}>
      {children}
    </PdfSessionProvider>
  )
}

function PdfSessionHost({ children }: { children: ReactNode }) {
  const { activeTab } = useWorkspace()
  const localDocument = activeTab?.localDocument
  const isPdf = localDocument?.kind === 'pdf'
  const { state, blob } = useLocalDocumentBlob(
    isPdf ? localDocument.id : undefined,
  )
  const storedBlob = state === 'ready' ? blob : null

  return (
    <PdfEditorProvider
      document={isPdf ? localDocument : null}
      blob={isPdf ? storedBlob : null}
    >
      <EditorSessionHost
        documentId={isPdf ? localDocument.id : undefined}
        storedBlob={isPdf ? storedBlob : null}
      >
        {children}
      </EditorSessionHost>
    </PdfEditorProvider>
  )
}

/** Runs the workspace shortcuts; must render inside PdfSessionHost so the
 * editor undo/redo bindings can reach PdfEditorProvider. */
function WorkspaceShortcuts() {
  useWorkspaceShortcuts()
  return null
}

function WorkspaceAreaInner({ initialDocumentIds = [] }: WorkspaceAreaProps) {
  useWorkspacePersistence()
  const { panels, tabs, activeTab, openLocalDocuments } = useWorkspace()
  const { toast } = useToast()
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (initialDocumentIds.length === 0) return
    let cancelled = false
    void (async () => {
      const documents = []
      for (const id of initialDocumentIds) {
        if (cancelled) break
        const document = await getLocalDocument(id)
        if (cancelled) break
        if (document) documents.push(document)
      }
      if (cancelled || documents.length === 0) return
      for (const document of documents) {
        void touchDocument(document.id)
      }
      openLocalDocuments(documents)
    })()
    return () => {
      cancelled = true
    }
  }, [initialDocumentIds, openLocalDocuments])

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return

    setImporting(true)
    try {
      const results = await ingestFiles(files)
      const registered = results.filter((result) => result.document !== null)
      const failed = results.filter((result) => result.error !== null)

      if (failed.length > 0) {
        toast({
          title:
            failed.length === 1
              ? 'A file could not be opened'
              : `${failed.length} files could not be opened`,
          description: failed[0].error ?? 'The file could not be read.',
          variant: 'error',
        })
      }
      if (registered.length > 0) {
        openLocalDocuments(registered.map((result) => result.document!))
        if (registered.length > 1) {
          toast({
            title: 'Documents opened',
            description: `${registered.length} documents were opened as workspace tabs.`,
            variant: 'success',
          })
        }
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <PdfSessionHost>
      <div
        role="region"
        aria-label="Document workspace"
        className="workspace-area"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return
          }
          setDragging(false)
        }}
        onDrop={handleDrop}
      >
        <WorkspaceShortcuts />
        {dragging && (
          <div className="workspace-area__drop" aria-hidden="true">
            {importing ? 'Importing…' : 'Drop to open in the workspace'}
          </div>
        )}
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
            <PanelResizeHandle
              panel="inspector"
              label="Resize inspector panel"
            />
          )}
          {panels.inspector !== 'hidden' && (
            <WorkspacePanel panel="inspector" />
          )}
        </div>

        <WorkspaceActionBar />

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
 * document tabs, resizable panels, the document canvas, a fixed bottom
 * action bar for the active PDF, and reserved floating regions. It owns
 * the workspace state and interaction framework.
 */
export function WorkspaceArea({ initialDocumentIds }: WorkspaceAreaProps) {
  return (
    <WorkspaceProvider>
      <WorkspaceAreaInner initialDocumentIds={initialDocumentIds} />
    </WorkspaceProvider>
  )
}