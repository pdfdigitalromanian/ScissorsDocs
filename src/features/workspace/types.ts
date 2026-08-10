export type PanelId = 'left' | 'inspector' | 'bottom'

export type PanelMode = 'open' | 'collapsed' | 'hidden'

export type FloatingRegionId =
  | 'ai-assistant'
  | 'ai-chat'
  | 'thumbnail'
  | 'outline'
  | 'properties'
  | 'layers'
  | 'comments'
  | 'search'
  | 'toolbars'

import type { IconName } from '@/components/icons/Icon'
import type { LocalDocument } from '@/features/documents'

export type PanelSlot = 'panel-left' | 'panel-right' | 'panel-bottom'

/** Lifecycle status of an open document session. */
export type DocumentStatus = 'ready' | 'processing' | 'syncing'

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  ready: 'Ready',
  processing: 'Processing',
  syncing: 'Syncing',
}

export interface DocumentTab {
  id: string
  title: string
  subtitle?: string
  extension?: string
  size?: string
  status?: DocumentStatus
  icon?: IconName
  /** Present when the session is backed by a real local document. */
  localDocument?: LocalDocument
}

export interface WorkspaceState {
  panels: Record<PanelId, PanelMode>
  panelSizes: Record<PanelId, number>
  tabs: DocumentTab[]
  activeTabId: string | null
  floatingRegions: Record<FloatingRegionId, boolean>
}
