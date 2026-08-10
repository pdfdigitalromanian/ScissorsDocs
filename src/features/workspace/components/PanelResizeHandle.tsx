import { useResizeHandle } from '@/components/layout/useResizeHandle'
import { useWorkspace } from '../state/use-workspace'
import { PANEL_DEFAULTS } from '../config'
import type { PanelId } from '../types'

interface PanelResizeHandleProps {
  panel: PanelId
  label: string
}

/**
 * PanelResizeHandle is the keyboard-operable divider that resizes a
 * workspace panel. It shares the pointer/keyboard interaction model of
 * the layout SplitPane through the common useResizeHandle hook.
 */
export function PanelResizeHandle({ panel, label }: PanelResizeHandleProps) {
  const { panelSizes, resizePanel } = useWorkspace()
  const { min, max, orientation, invert } = PANEL_DEFAULTS[panel]
  const size = panelSizes[panel]

  const {
    active,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
  } = useResizeHandle({
    direction: orientation,
    value: size,
    min,
    max,
    invert,
    onChange: (next) => resizePanel(panel, next),
  })

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={
        orientation === 'horizontal' ? 'vertical' : 'horizontal'
      }
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(size)}
      className={`panel-resize-handle${
        active ? ' panel-resize-handle--active' : ''
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    />
  )
}
