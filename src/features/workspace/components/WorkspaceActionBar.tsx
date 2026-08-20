import { useState } from 'react'
import IconButton from '@/components/ui/IconButton'
import { useToast } from '@/components/ui'
import { downloadBlob } from '@/features/documents'
import { EditorDialogs } from '@/features/editor/components/EditorDialogs'
import type { EditorDialogId } from '@/features/editor/components/EditorDialogs'
import { usePdfEditor } from '@/features/editor/PdfEditorProvider'
import { usePdfSession } from '@/features/pdf'
import { useWorkspace } from '../state/use-workspace'

/**
 * WorkspaceActionBar is the single fixed strip of document-level tools
 * anchored to the bottom of the workspace — edit text, edit content,
 * plus the document-level actions (extract/split/merge). Adding and
 * replacing pages live in the Pages thumbnails panel where page
 * management is grouped together. Document information and download
 * live in the PDF viewer's own toolbar. Only renders for the active PDF.
 */
export function WorkspaceActionBar() {
    const { activeTab } = useWorkspace()
    const localDocument = activeTab?.localDocument
    const session = usePdfSession()
    const editor = usePdfEditor()
    const { toast } = useToast()
    const [dialog, setDialog] = useState<EditorDialogId | null>(null)

    if (!localDocument || localDocument.kind !== 'pdf') return null

    const canEditText = editor.status === 'ready' && !editor.busy
    const busy = editor.busy
    const selectionCount = editor.selectedPageIds.length
    const selectionDisabled = busy || selectionCount === 0

    function handleToggleTextEditing() {
        if (session.textEditing) {
            /* commitTextSelection only flushes whatever text run is currently
             * being edited — it never turns edit mode itself off. Without this
             * second call, "Stop editing text" commits the pending edit but
             * every run on the page stays contenteditable. */
            session.commitTextSelection()
            session.setTextEditing(false)
        } else {
            editor.setEditMode(false)
            editor.setSignMode(false)
            session.setTextEditing(true)
        }
    }

    async function handleExtract() {
        const output = await editor.extractSelected()
        if (!output) return
        downloadBlob(
            new Blob([output.bytes as BlobPart], { type: 'application/pdf' }),
            output.name,
        )
        toast({
            title: 'Pages extracted',
            description: `${output.pageCount} page${output.pageCount === 1 ? '' : 's'} saved as "${output.name}".`,
            variant: 'success',
        })
    }

    return (
        <>
            <div
                className="workspace-action-bar"
                role="toolbar"
                aria-label="Document tools"
            >
                <IconButton
                    icon="text"
                    label={session.textEditing ? 'Stop editing text' : 'Edit text'}
                    iconSize="sm"
                    aria-pressed={session.textEditing}
                    disabled={!canEditText ? true : true}
                    onClick={handleToggleTextEditing}
                />
                <IconButton
                    icon="edit"
                    label={editor.editMode ? 'Exit edit mode' : 'Edit content'}
                    iconSize="sm"
                    aria-pressed={editor.editMode}
                    onClick={() => {
                        if (editor.editMode) {
                            editor.setEditMode(false)
                            return
                        }
                        session.setTextEditing(false)
                        editor.setSignMode(false)
                        editor.setEditMode(true)
                    }}
                />
                <IconButton
                    icon="sign"
                    label={editor.signMode ? 'Exit sign mode' : 'Sign this PDF'}
                    iconSize="sm"
                    aria-pressed={editor.signMode}
                    onClick={() => {
                        if (editor.signMode) {
                            editor.setSignMode(false)
                            return
                        }
                        session.setTextEditing(false)
                        editor.setEditMode(false)
                        editor.setSignMode(true)
                    }}
                />
                <IconButton
                    icon="scissors"
                    label="Extract a page"
                    iconSize="sm"
                    disabled={selectionDisabled}
                    onClick={() => void handleExtract()}
                />
                <IconButton
                    icon="split"
                    label="Split document"
                    iconSize="sm"
                    disabled={busy}
                    onClick={() => setDialog('split')}
                />
                <IconButton
                    icon="merge"
                    label="Merge documents"
                    iconSize="sm"
                    disabled={busy}
                    onClick={() => setDialog('merge')}
                />
            </div>
            <EditorDialogs dialog={dialog} onClose={() => setDialog(null)} />
        </>
    )
}