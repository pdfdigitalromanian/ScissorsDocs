export { WorkspaceArea } from './components/WorkspaceArea'
export { WorkspaceHeader } from './components/WorkspaceHeader'
export { WorkspaceToolbar } from './components/WorkspaceToolbar'
export { WorkspaceCommandBar } from './components/WorkspaceCommandBar'
export { DocumentTabs } from './components/DocumentTabs'
export { WorkspacePanel } from './components/WorkspacePanel'
export { PanelResizeHandle } from './components/PanelResizeHandle'
export { WorkspaceCanvas } from './components/WorkspaceCanvas'
export { DocumentContainer } from './components/DocumentContainer'
export { EmptyWorkspaceView } from './components/EmptyWorkspaceView'
export { PanelRegion } from './components/PanelRegion'
export { FloatingPanelRegion } from './components/FloatingPanelRegion'
export { WorkspaceProvider } from './state/workspace-provider'
export { useWorkspace } from './state/use-workspace'
export { createCommandRegistry, CommandRegistry } from './interaction/commands'
export { useShortcuts } from './interaction/shortcuts'
export type { ShortcutBinding } from './interaction/shortcuts'
export { useSelection } from './interaction/selection'
export { useWorkspaceCommands } from './interaction/workspace-interactions'

export type {
  DocumentTab,
  DocumentStatus,
  FloatingRegionId,
  PanelId,
  PanelMode,
  PanelSlot,
  WorkspaceState,
} from './types'
export type { PanelConfig, ReservedRegion } from './config'
export { PANEL_DEFAULTS, RESERVED_REGIONS } from './config'
