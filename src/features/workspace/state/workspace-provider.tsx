import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LocalDocument } from '@/features/documents'
import { PANEL_DEFAULTS } from '../config'
import { toLocalDocumentTab } from '../data/local-documents'
import type {
  DocumentTab,
  FloatingRegionId,
  PanelId,
  PanelMode,
  WorkspaceState,
} from '../types'

interface WorkspaceContextValue extends WorkspaceState {
  activeTab: DocumentTab | null
  openLocalDocument: (document: LocalDocument) => void
  togglePanel: (panel: PanelId) => void
  togglePanelVisibility: (panel: PanelId) => void
  resizePanel: (panel: PanelId, size: number) => void
  activateTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  restoreWorkspaceState: (state: {
    tabs: DocumentTab[]
    activeTabId: string | null
    panels: Record<PanelId, PanelMode>
    panelSizes: Record<PanelId, number>
  }) => void
  resetWorkspace: () => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
)

interface WorkspaceProviderProps {
  children: ReactNode
}

const initialPanels: Record<PanelId, PanelMode> = {
  left: PANEL_DEFAULTS.left.mode,
  inspector: PANEL_DEFAULTS.inspector.mode,
  bottom: PANEL_DEFAULTS.bottom.mode,
}

const initialPanelSizes: Record<PanelId, number> = {
  left: PANEL_DEFAULTS.left.size,
  inspector: PANEL_DEFAULTS.inspector.size,
  bottom: PANEL_DEFAULTS.bottom.size,
}

const initialFloatingRegions: Record<FloatingRegionId, boolean> = {
  'ai-assistant': false,
  'ai-chat': false,
  thumbnail: false,
  outline: false,
  properties: false,
  layers: false,
  comments: false,
  search: false,
  toolbars: false,
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [panels, setPanels] =
    useState<Record<PanelId, PanelMode>>(initialPanels)
  const [panelSizes, setPanelSizes] =
    useState<Record<PanelId, number>>(initialPanelSizes)
  const [tabs, setTabs] = useState<DocumentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [floatingRegions] = useState<Record<FloatingRegionId, boolean>>(
    initialFloatingRegions,
  )

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  )

  const togglePanel = useCallback((panel: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panel]: prev[panel] === 'open' ? 'collapsed' : 'open',
    }))
  }, [])

  const togglePanelVisibility = useCallback((panel: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [panel]: prev[panel] === 'hidden' ? 'open' : 'hidden',
    }))
  }, [])

  const resizePanel = useCallback((panel: PanelId, size: number) => {
    setPanelSizes((prev) => ({
      ...prev,
      [panel]: size,
    }))
  }, [])

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  /**
   * Opens a local document session. Re-opening an already-open document
   * only activates its existing tab (no duplicate sessions).
   */
  const openLocalDocument = useCallback((document: LocalDocument) => {
    setTabs((prev) =>
      prev.some((tab) => tab.id === document.id)
        ? prev
        : [...prev, toLocalDocumentTab(document)],
    )
    setActiveTabId(document.id)
  }, [])

  const closeTab = useCallback(
    (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) return
      const next = tabs.filter((tab) => tab.id !== tabId)
      setTabs(next)
      if (activeTabId === tabId) {
        const neighbor = next[Math.min(index, next.length - 1)]
        setActiveTabId(neighbor ? neighbor.id : null)
      }
    },
    [tabs, activeTabId],
  )

  /**
   * Replaces the session state wholesale when restoring a persisted
   * workspace on startup.
   */
  const restoreWorkspaceState = useCallback(
    (state: {
      tabs: DocumentTab[]
      activeTabId: string | null
      panels: Record<PanelId, PanelMode>
      panelSizes: Record<PanelId, number>
    }) => {
      setTabs(state.tabs)
      setActiveTabId(state.activeTabId)
      setPanels(state.panels)
      setPanelSizes(state.panelSizes)
    },
    [],
  )

  const resetWorkspace = useCallback(() => {
    setTabs([])
    setActiveTabId(null)
  }, [])

  const value: WorkspaceContextValue = useMemo(
    () => ({
      panels,
      panelSizes,
      tabs,
      activeTabId,
      activeTab,
      floatingRegions,
      openLocalDocument,
      togglePanel,
      togglePanelVisibility,
      resizePanel,
      activateTab,
      closeTab,
      restoreWorkspaceState,
      resetWorkspace,
    }),
    [
      panels,
      panelSizes,
      tabs,
      activeTabId,
      activeTab,
      floatingRegions,
      openLocalDocument,
      togglePanel,
      togglePanelVisibility,
      resizePanel,
      activateTab,
      closeTab,
      restoreWorkspaceState,
      resetWorkspace,
    ],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}
