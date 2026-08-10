import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import IconButton from '@/components/ui/IconButton'
import { PanelContent, PanelHeader, PanelTitle } from '@/components/layout'
import type { IconName } from '@/components/icons/Icon'
import { PdfThumbnails } from '@/features/pdf'
import { PANEL_DEFAULTS, getRegionsForSlot } from '../config'
import type { PanelId, PanelSlot } from '../types'
import { useWorkspace } from '../state/use-workspace'
import { PanelRegion } from './PanelRegion'

const PANEL_SLOT: Record<PanelId, PanelSlot> = {
  left: 'panel-left',
  inspector: 'panel-right',
  bottom: 'panel-bottom',
}

const COLLAPSE_ICON: Record<PanelId, IconName> = {
  left: 'chevron-left',
  inspector: 'chevron-right',
  bottom: 'chevron-down',
}

const EXPAND_ICON: Record<PanelId, IconName> = {
  left: 'chevron-right',
  inspector: 'chevron-left',
  bottom: 'chevron-up',
}

interface WorkspacePanelProps {
  panel: PanelId
}

/**
 * WorkspacePanel renders a workspace panel in its current mode: fully
 * open (resizable surface with reserved regions), collapsed (compact
 * rail with an expand control) or hidden (nothing rendered).
 */
export function WorkspacePanel({ panel }: WorkspacePanelProps) {
  const { panels, panelSizes, togglePanel } = useWorkspace()
  const mode = panels[panel]
  const regionRef = useRef<HTMLDivElement>(null)
  const prevModeRef = useRef(mode)

  const { label, orientation } = PANEL_DEFAULTS[panel]
  const size = panelSizes[panel]
  const reservedRegions = getRegionsForSlot(PANEL_SLOT[panel])

  useEffect(() => {
    const previous = prevModeRef.current
    prevModeRef.current = mode
    if (previous === 'collapsed' && mode === 'open') {
      regionRef.current?.focus()
    }
  }, [mode])

  if (mode === 'hidden') return null

  const isHorizontal = orientation === 'vertical'
  const sizeStyle = {
    '--panel-size': `${size}px`,
  } as CSSProperties

  const panelClasses = `workspace-panel workspace-panel--${panel}${isHorizontal ? ' workspace-panel--horizontal' : ''
    }`

  if (mode === 'collapsed') {
    return (
      <div
        ref={regionRef}
        tabIndex={-1}
        aria-label={label}
        className={`${panelClasses} workspace-panel--collapsed`}
      >
        <IconButton
          icon={EXPAND_ICON[panel]}
          label={`Expand ${label}`}
          iconSize="sm"
          className="workspace-panel__expand"
          onClick={() => togglePanel(panel)}
        />
      </div>
    )
  }

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      style={sizeStyle}
      className={panelClasses}
    >
      <PanelHeader className="workspace-panel__header">
        <PanelTitle className="workspace-panel__title">{label}</PanelTitle>
        <IconButton
          icon={COLLAPSE_ICON[panel]}
          label={`Collapse ${label}`}
          iconSize="sm"
          className="workspace-panel__collapse"
          onClick={() => togglePanel(panel)}
        />
      </PanelHeader>
      <PanelContent className="workspace-panel__content">
        {reservedRegions.length > 0 ? (
          reservedRegions.map((region) => (
            <PanelRegion key={region.id} title={region.label}>
              {region.id === 'thumbnail' ? <PdfThumbnails /> : undefined}
            </PanelRegion>
          ))
        ) : (
          <PanelRegion title={label} hint="Reserved for future panels" />
        )}
      </PanelContent>
    </div>
  )
}
