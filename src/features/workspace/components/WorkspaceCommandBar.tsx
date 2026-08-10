import Button from '@/components/ui/Button'
import { ToolbarGroup } from '@/components/layout'

const COMMAND_ACTIONS = [
  { id: 'save', label: 'Save' },
  { id: 'undo', label: 'Undo' },
  { id: 'redo', label: 'Redo' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'print', label: 'Print' },
  { id: 'share', label: 'Share' },
  { id: 'ai', label: 'AI' },
] as const

/**
 * WorkspaceCommandBar — placeholder document command bar. Every action is
 * disabled and carries no functionality in this milestone; the group only
 * reserves the surface for future document tools.
 */
export function WorkspaceCommandBar() {
  return (
    <ToolbarGroup className="workspace-command-bar">
      {COMMAND_ACTIONS.map((action) => (
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
