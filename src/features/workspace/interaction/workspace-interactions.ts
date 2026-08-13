import { useMemo } from 'react'
import { usePdfEditor } from '@/features/editor/PdfEditorProvider'
import { useWorkspace } from '../state/use-workspace'
import { createCommandRegistry } from './commands'
import type { CommandRegistry } from './commands'
import { useShortcuts } from './shortcuts'
import type { ShortcutBinding } from './shortcuts'

/**
 * useWorkspaceCommands exposes the workspace's intrinsic commands through
 * the command execution structure. The registry is rebuilt whenever the
 * workspace state changes so commands always act on current state.
 */
export function useWorkspaceCommands(): CommandRegistry {
  const { tabs, activeTabId, togglePanelVisibility, closeTab, activateTab } =
    useWorkspace()

  return useMemo(() => {
    const registry = createCommandRegistry()

    const cycle = (delta: number) => {
      if (tabs.length === 0) return
      const index = Math.max(
        tabs.findIndex((tab) => tab.id === activeTabId),
        0,
      )
      const next = tabs[(index + delta + tabs.length) % tabs.length]
      activateTab(next.id)
    }

    registry.register({
      id: 'workspace.toggleLeftPanel',
      label: 'Toggle the left panel',
      execute: () => togglePanelVisibility('left'),
    })
    registry.register({
      id: 'workspace.toggleInspectorPanel',
      label: 'Toggle the inspector panel',
      execute: () => togglePanelVisibility('inspector'),
    })
    registry.register({
      id: 'workspace.closeActiveTab',
      label: 'Close the active document tab',
      execute: () => {
        if (activeTabId) closeTab(activeTabId)
      },
    })
    registry.register({
      id: 'workspace.nextTab',
      label: 'Switch to the next document tab',
      execute: () => cycle(1),
    })
    registry.register({
      id: 'workspace.previousTab',
      label: 'Switch to the previous document tab',
      execute: () => cycle(-1),
    })

    return registry
  }, [tabs, activeTabId, togglePanelVisibility, closeTab, activateTab])
}

/**
 * useWorkspaceShortcuts binds the workspace keyboard shortcuts to its
 * intrinsic commands. Combo choices follow platform conventions and are
 * ignored while typing in editable fields.
 */
export function useWorkspaceShortcuts(): void {
  const commands = useWorkspaceCommands()
  const { undo, redo } = usePdfEditor()

  const bindings: ShortcutBinding[] = [
    {
      combo: 'mod+w',
      handler: (event) => {
        event.preventDefault()
        commands.execute('workspace.closeActiveTab')
      },
    },
    {
      combo: 'mod+z',
      handler: (event) => {
        event.preventDefault()
        void undo()
      },
    },
    {
      combo: 'mod+shift+z',
      handler: (event) => {
        event.preventDefault()
        void redo()
      },
    },
    {
      combo: 'mod+y',
      handler: (event) => {
        event.preventDefault()
        void redo()
      },
    },
    {
      combo: 'alt+1',
      handler: () => commands.execute('workspace.toggleLeftPanel'),
    },
    {
      combo: 'alt+2',
      handler: () => commands.execute('workspace.toggleInspectorPanel'),
    },
    {
      combo: 'mod+shift+]',
      handler: (event) => {
        event.preventDefault()
        commands.execute('workspace.nextTab')
      },
    },
    {
      combo: 'mod+shift+[',
      handler: (event) => {
        event.preventDefault()
        commands.execute('workspace.previousTab')
      },
    },
  ]

  useShortcuts(bindings)
}