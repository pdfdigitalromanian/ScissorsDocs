import { workspaceBackend } from '@/features/documents/storage/db'
import { PANEL_DEFAULTS } from '../config'
import type { DocumentTab, PanelId, PanelMode } from '../types'

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
  /**
   * Reserved for a future workspace folder surface. Local folders live in
   * the document backend (folders store), not in the session snapshot.
   */
  folders: string[]
}

function fallbackPanels(): Record<PanelId, PanelMode> {
  return {
    left: PANEL_DEFAULTS.left.mode,
    inspector: PANEL_DEFAULTS.inspector.mode,
  }
}

function fallbackPanelSizes(): Record<PanelId, number> {
  return {
    left: PANEL_DEFAULTS.left.size,
    inspector: PANEL_DEFAULTS.inspector.size,
  }
}

function isPanels(
  value: unknown,
): value is Record<PanelId, PanelMode> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.left === 'string' &&
    typeof candidate.inspector === 'string'
  )
}

function isPanelSizes(value: unknown): value is Record<PanelId, number> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.left === 'number' &&
    typeof candidate.inspector === 'number'
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

/** Builds a persisted snapshot from the live workspace state. */
export function buildWorkspaceSnapshot(
  tabs: DocumentTab[],
  activeTabId: string | null,
  panels: Record<PanelId, PanelMode>,
  panelSizes: Record<PanelId, number>,
): WorkspaceStateSnapshot {
  return {
    version: 1,
    tabs: tabs
      .filter(
        (
          tab,
        ): tab is DocumentTab & {
          localDocument: NonNullable<DocumentTab['localDocument']>
        } => Boolean(tab.localDocument),
      )
      .map(
        (tab): WorkspaceTabSnapshot => ({
          localDocumentId: tab.localDocument.id,
          title: tab.title,
        }),
      ),
    activeTabId,
    panels,
    panelSizes,
    folders: [],
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