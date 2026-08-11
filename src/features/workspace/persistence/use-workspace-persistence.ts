import { useEffect, useRef } from 'react'
import { getLocalDocument } from '@/features/documents'
import { toLocalDocumentTab } from '../data/local-documents'
import type { DocumentTab } from '../types'
import { useWorkspace } from '../state/use-workspace'
import {
  getRestorePreference,
  loadWorkspaceState,
  saveWorkspaceState,
  buildWorkspaceSnapshot,
} from './workspace-store'

/**
 * useWorkspacePersistence hydrates the workspace from local storage on mount
 * and keeps a debounced copy of the open session in sync. Persisted tabs are
 * revalidated against the local document registry, so a removed document
 * never comes back as a dead tab.
 *
 * A deep-linked document (opened through the workspace's initialDocumentId
 * flow) simply opens on top of whatever was restored — persistence stays
 * active in every flow.
 */
export function useWorkspacePersistence() {
  const {
    tabs,
    activeTabId,
    panels,
    panelSizes,
    restoreWorkspaceState,
  } = useWorkspace()
  const hydratedRef = useRef(false)
  const tabsRef = useRef(tabs)

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  /* Hydrate the workspace once. Persistence only arms once this settles,
     so a saved workspace is never clobbered by mount-time defaults. */
  useEffect(() => {
    if (!getRestorePreference()) return

    let cancelled = false
    void (async () => {
      try {
        const snapshot = await loadWorkspaceState()
        if (cancelled || !snapshot || snapshot.tabs.length === 0) return

        const restored: DocumentTab[] = []
        for (const tab of snapshot.tabs) {
          if (cancelled) return
          const local = await getLocalDocument(tab.localDocumentId)
          if (cancelled) return
          if (local) restored.push(toLocalDocumentTab(local))
        }
        if (cancelled || restored.length === 0) return
        if (tabsRef.current.length > 0) return

        const activeId = snapshot.activeTabId
        restoreWorkspaceState({
          tabs: restored,
          activeTabId:
            activeId && restored.some((tab) => tab.id === activeId)
              ? activeId
              : restored[0].id,
          panels: snapshot.panels,
          panelSizes: snapshot.panelSizes,
        })
      } finally {
        hydratedRef.current = true
      }
    })()

    return () => {
      cancelled = true
    }
  }, [restoreWorkspaceState])

  /* Keep the persisted workspace in sync (debounced) after hydration. */
  useEffect(() => {
    if (!hydratedRef.current) return

    const snapshot = buildWorkspaceSnapshot(tabs, activeTabId, panels, panelSizes)
    const handle = window.setTimeout(() => {
      void saveWorkspaceState(snapshot)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [tabs, activeTabId, panels, panelSizes])
}
