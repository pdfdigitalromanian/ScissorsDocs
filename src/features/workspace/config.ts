import type { FloatingRegionId, PanelId, PanelMode, PanelSlot } from './types'
import type { ResizeDirection } from '@/components/layout/useResizeHandle'
import type { FloatingPanelPlacement } from '@/components/layout'

export interface PanelConfig {
  label: string
  /** Initial size in px for the panel's primary dimension. */
  size: number
  min: number
  max: number
  /** Resize direction of the panel's divider edge. */
  orientation: ResizeDirection
  /**
   * Invert divider drag/keyboard direction. True for panels docked to the
   * right so dragging the divider toward the panel grows it.
   */
  invert?: boolean
  mode: PanelMode
}

export const PANEL_DEFAULTS: Record<PanelId, PanelConfig> = {
  left: {
    label: 'Pages',
    size: 240,
    min: 180,
    max: 480,
    orientation: 'horizontal',
    mode: 'open',
  },
  inspector: {
    label: 'Inspector',
    size: 260,
    min: 200,
    max: 520,
    orientation: 'horizontal',
    invert: true,
    mode: 'open',
  },
}

export interface ReservedRegion {
  id: FloatingRegionId
  label: string
  slot: PanelSlot
  /** Placement used when the region renders as a floating surface. */
  floatingPlacement?: FloatingPanelPlacement
}

/**
 * Registry of future workspace regions. Slots are reserved here so later
 * milestones can mount tools without restructuring the workspace layout.
 * No functionality is attached to any region in this milestone.
 */
export const RESERVED_REGIONS: ReservedRegion[] = [
  {
    id: 'thumbnail',
    label: 'Thumbnails',
    slot: 'panel-left',
  },
  {
    id: 'outline',
    label: 'Outline',
    slot: 'panel-left',
  },
  {
    id: 'properties',
    label: 'Properties',
    slot: 'panel-right',
  },
  {
    id: 'layers',
    label: 'Layers',
    slot: 'panel-right',
  },
  {
    id: 'comments',
    label: 'Comments',
    slot: 'panel-right',
  },
  {
    id: 'search',
    label: 'Search',
    slot: 'panel-right',
  },
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    slot: 'panel-right',
    floatingPlacement: 'top-end',
  },
  {
    id: 'ai-chat',
    label: 'AI Chat',
    slot: 'panel-right',
    floatingPlacement: 'bottom-end',
  },
  {
    id: 'toolbars',
    label: 'Floating Toolbars',
    slot: 'panel-right',
    floatingPlacement: 'top-start',
  },
]

export const DOCUMENT_PANEL_ID = 'workspace-document-panel'

export function getTabElementId(tabId: string): string {
  return `workspace-tab-${tabId}`
}

export function getRegionsForSlot(slot: PanelSlot): ReservedRegion[] {
  return RESERVED_REGIONS.filter((region) => region.slot === slot)
}