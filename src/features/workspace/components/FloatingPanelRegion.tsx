import type { ReactNode } from 'react'
import { FloatingPanel } from '@/components/layout'
import type { FloatingPanelPlacement } from '@/components/layout'
import type { FloatingRegionId } from '../types'
import { useWorkspace } from '../state/use-workspace'

interface FloatingPanelRegionProps {
  region: FloatingRegionId
  title: string
  placement: FloatingPanelPlacement
  children?: ReactNode
}

/**
 * FloatingPanelRegion reserves an anchored floating slot inside the
 * workspace for future regions (AI Assistant, AI Chat, ...). It renders
 * as an open/closed floating surface driven by workspace state.
 */
export function FloatingPanelRegion({
  region,
  title,
  placement,
  children,
}: FloatingPanelRegionProps) {
  const { floatingRegions } = useWorkspace()
  const open = floatingRegions[region]

  return (
    <FloatingPanel
      open={open}
      placement={placement}
      role="region"
      aria-label={title}
      className="workspace-floating-region"
    >
      {children ?? (
        <p className="workspace-floating-region__hint">Reserved region</p>
      )}
    </FloatingPanel>
  )
}
