import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LocalDocument } from '@/features/documents'
import { useSettings } from '@/features/settings/SettingsProvider'
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
  openLocalDocuments: (documents: LocalDocument[]) => void
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
}

const initialPanelSizes: Record<PanelId, number> = {
  left: PANEL_DEFAULTS.left.size,
  inspector: PANEL_DEFAULTS.inspector.size,
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
  const { settings } = useSettings()
  const [panels, setPanels] = useState<Record<PanelId, PanelMode>>(() => ({
    ...initialPanels,
    left: settings.viewer.showPagesPanel ? 'open' : 'collapsed',
  }))
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
   * Opens a batch of local document sessions. Documents that already have a
   * tab are not duplicated; the first document in the batch becomes the
   * active tab so an uploaded folder/multi-selection lands on its primary
   * file.
   */
  const openLocalDocuments = useCallback((documents: LocalDocument[]) => {
    if (documents.length === 0) return
    setTabs((prev) => {
      const existing = new Set(prev.map((tab) => tab.id))
      const additions = documents
        .filter((document) => !existing.has(document.id))
        .map(toLocalDocumentTab)
      return additions.length === 0 ? prev : [...prev, ...additions]
    })
    setActiveTabId(documents[0].id)
  }, [])

  /**
   * Opens a local document session. Re-opening an already-open document
   * only activates its existing tab (no duplicate sessions).
   */
  const openLocalDocument = useCallback(
    (document: LocalDocument) => openLocalDocuments([document]),
    [openLocalDocuments],
  )

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
      openLocalDocuments,
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
      openLocalDocuments,
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