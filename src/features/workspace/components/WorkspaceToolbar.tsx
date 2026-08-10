import Button from '@/components/ui/Button'
import { Toolbar, ToolbarDivider, ToolbarGroup } from '@/components/layout'
import { PANEL_DEFAULTS } from '../config'
import type { PanelId } from '../types'
import { useWorkspace } from '../state/use-workspace'
import { WorkspaceCommandBar } from './WorkspaceCommandBar'
import { OpenDocumentButton } from './OpenDocumentButton'

const TOGGLE_ORDER: PanelId[] = ['left', 'inspector', 'bottom']

/**
 * WorkspaceToolbar hosts the workspace controls — the placeholder command
 * bar, the Open entry point and each panel's visibility toggle — inside
 * one accessible toolbar.
 */
export function WorkspaceToolbar() {
  const { panels, togglePanelVisibility } = useWorkspace()

  return (
    <Toolbar ariaLabel="Workspace controls" bare>
      <WorkspaceCommandBar />
      <ToolbarDivider />
      <ToolbarGroup>
        <OpenDocumentButton label="Open" variant="outline" size="sm" />
        {TOGGLE_ORDER.map((panel) => {
          const visible = panels[panel] !== 'hidden'
          return (
            <Button
              key={panel}
              variant="ghost"
              size="sm"
              aria-pressed={visible}
              onClick={() => togglePanelVisibility(panel)}
            >
              {PANEL_DEFAULTS[panel].label}
            </Button>
          )
        })}
      </ToolbarGroup>
    </Toolbar>
  )
}
