import Button from '@/components/ui/Button'
import { ToolbarGroup } from '@/components/layout'
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownTrigger,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons/Icon'
import { touchDocument } from '@/features/documents'
import { usePdfEditor } from '@/features/editor/PdfEditorProvider'
import { usePdfSession } from '@/features/pdf'
import { useWorkspace } from '../state/use-workspace'
import { buildWorkspaceSnapshot, saveWorkspaceState } from '../persistence/workspace-store'

const FUTURE_ACTIONS = [
  { id: 'print', label: 'Print' },
  { id: 'share', label: 'Share' },
  { id: 'ai', label: 'AI' },
] as const

/**
 * WorkspaceCommandBar — real document commands. Save persists the open
 * session and document locally; Undo, Redo and Rotate drive the PDF
 * editor; Zoom controls the live PDF session. Print, Share and AI stay
 * disabled until their tools exist.
 */
export function WorkspaceCommandBar() {
  const { toast } = useToast()
  const { tabs, activeTab, activeTabId, panels, panelSizes } = useWorkspace()
  const pdfSession = usePdfSession()
  const editor = usePdfEditor()
  const localDocument = activeTab?.localDocument
  const isPdf = localDocument?.kind === 'pdf'
  const editorReady = isPdf && editor.status === 'ready'
  const hasSelection = editor.selectedPageIds.length > 0

  async function handleSave() {
    const snapshot = buildWorkspaceSnapshot(tabs, activeTabId, panels, panelSizes)
    await saveWorkspaceState(snapshot)
    if (editorReady) {
      const result = await editor.save()
      if (result.error) {
        toast({
          title: 'Save failed',
          description: result.error,
          variant: 'error',
        })
        return
      }
    } else if (localDocument) {
      await touchDocument(localDocument.id)
    }
    toast({
      title: 'Workspace saved',
      description: 'Your workspace and documents are saved on this device.',
      variant: 'success',
    })
  }

  const handleUndo = async () => {
    await editor.undo()
  }

  const handleRedo = async () => {
    await editor.redo()
  }

  const handleRotate = async () => {
    await editor.rotateSelected('clockwise')
  }

  return (
    <ToolbarGroup className="workspace-command-bar">
      <Button
        variant="ghost"
        size="sm"
        disabled={!localDocument}
        className="workspace-command-bar__action"
        onClick={() => void handleSave()}
      >
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!editorReady || editor.busy || !editor.canUndo}
        className="workspace-command-bar__action"
        onClick={() => void handleUndo()}
      >
        <Icon name="undo" size="sm" />
        Undo
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!editorReady || editor.busy || !editor.canRedo}
        className="workspace-command-bar__action"
        onClick={() => void handleRedo()}
      >
        <Icon name="redo" size="sm" />
        Redo
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!editorReady || editor.busy || !hasSelection}
        className="workspace-command-bar__action"
        onClick={() => void handleRotate()}
      >
        <Icon name="rotate" size="sm" />
        Rotate
      </Button>
      <Dropdown>
        <DropdownTrigger
          className="workspace-command-bar__action workspace-command-bar__trigger"
          disabled={!isPdf}
          aria-label="Zoom controls"
        >
          <Icon name="zoom-in" size="sm" />
          Zoom
        </DropdownTrigger>
        <DropdownMenu>
          <DropdownLabel>Zoom</DropdownLabel>
          <DropdownItem icon="zoom-in" onSelect={pdfSession.zoomIn}>
            Zoom in
          </DropdownItem>
          <DropdownItem icon="zoom-out" onSelect={pdfSession.zoomOut}>
            Zoom out
          </DropdownItem>
          <DropdownItem icon="fit-width" onSelect={() => pdfSession.setFitMode('width')}>
            Fit to width
          </DropdownItem>
          <DropdownItem icon="fit-page" onSelect={() => pdfSession.setFitMode('page')}>
            Fit to page
          </DropdownItem>
          <DropdownItem icon="page" onSelect={pdfSession.resetZoom}>
            Reset zoom
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
      {FUTURE_ACTIONS.map((action) => (
        <Button
          key={action.id}
          variant="ghost"
          size="sm"
          disabled
          className="workspace-command-bar__action"
        >
          {action.label}
        </Button>
      ))}
    </ToolbarGroup>
  )
}
