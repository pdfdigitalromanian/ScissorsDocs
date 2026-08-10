import { workspaceBackend } from '@/features/documents/storage/db'
import { PANEL_DEFAULTS } from '../config'
import type { PanelId, PanelMode } from '../types'

const WORKSPACE_STATE_KEY = 'workspace-state'
const RESTORE_PREFERENCE_KEY = 'scissordoc-restore-workspace'

/**
 * A persisted tab reference. Tabs are rehydrated from the local document
 * registry by id, so a removed document drops its tab on restore.
 */
export interface WorkspaceTabSnapshot {
  localDocumentId: string
  title: string
}

export interface WorkspaceStateSnapshot {
  version: 1
  tabs: WorkspaceTabSnapshot[]
  activeTabId: string | null
  panels: Record<PanelId, PanelMode>
  panelSizes: Record<PanelId, number>
  /** Reserved for the folders milestone — no folder structure exists yet. */
  folders: string[]
}

function fallbackPanels(): Record<PanelId, PanelMode> {
  return {
    left: PANEL_DEFAULTS.left.mode,
    inspector: PANEL_DEFAULTS.inspector.mode,
    bottom: PANEL_DEFAULTS.bottom.mode,
  }
}

function fallbackPanelSizes(): Record<PanelId, number> {
  return {
    left: PANEL_DEFAULTS.left.size,
    inspector: PANEL_DEFAULTS.inspector.size,
    bottom: PANEL_DEFAULTS.bottom.size,
  }
}

function isPanels(
  value: unknown,
): value is Record<PanelId, PanelMode> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.left === 'string' &&
    typeof candidate.inspector === 'string' &&
    typeof candidate.bottom === 'string'
  )
}

function isPanelSizes(value: unknown): value is Record<PanelId, number> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.left === 'number' &&
    typeof candidate.inspector === 'number' &&
    typeof candidate.bottom === 'number'
  )
}

/** Loads the persisted workspace, validating its shape. */
export async function loadWorkspaceState(): Promise<WorkspaceStateSnapshot | null> {
  if (!workspaceBackend.isSupported()) return null
  try {
    const raw = await workspaceBackend.getValue(WORKSPACE_STATE_KEY)
    if (!raw || typeof raw !== 'object') return null
    const snapshot = raw as Partial<WorkspaceStateSnapshot>
    if (!Array.isArray(snapshot.tabs)) return null
    return {
      version: 1,
      tabs: snapshot.tabs,
      activeTabId: typeof snapshot.activeTabId === 'string' ? snapshot.activeTabId : null,
      panels: isPanels(snapshot.panels) ? snapshot.panels : fallbackPanels(),
      panelSizes: isPanelSizes(snapshot.panelSizes)
        ? snapshot.panelSizes
        : fallbackPanelSizes(),
      folders: [],
    }
  } catch {
    return null
  }
}

export async function saveWorkspaceState(
  snapshot: WorkspaceStateSnapshot,
): Promise<void> {
  if (!workspaceBackend.isSupported()) return
  try {
    await workspaceBackend.putValue(WORKSPACE_STATE_KEY, snapshot)
  } catch {
    // Storage unavailable — the workspace simply is not persisted.
  }
}

/** Clears persisted workspace state and document sessions. */
export async function clearWorkspaceState(): Promise<void> {
  if (!workspaceBackend.isSupported()) return
  try {
    await workspaceBackend.clearValues()
  } catch {
    // Best effort.
  }
}

export function getRestorePreference(): boolean {
  try {
    return localStorage.getItem(RESTORE_PREFERENCE_KEY) !== '0'
  } catch {
    return true
  }
}

export function setRestorePreference(enabled: boolean): void {
  try {
    localStorage.setItem(RESTORE_PREFERENCE_KEY, enabled ? '1' : '0')
  } catch {
    // Storage unavailable — the preference applies for this session.
  }
}
