import type { ReactNode } from 'react'

interface PanelRegionProps {
  title: string
  children?: ReactNode
  /** Rendered when the region has no mounted content yet. */
  hint?: string
  className?: string
}

/**
 * PanelRegion is an inert, labelled slot inside a workspace panel. Future
 * milestones mount real content into these regions; until then they render
 * as reserved surfaces with no behavior.
 */
export function PanelRegion({
  title,
  children,
  hint = 'Reserved region',
  className = '',
}: PanelRegionProps) {
  const classes = ['panel-region', className].filter(Boolean).join(' ')
  return (
    <section className={classes} aria-label={title}>
      <h4 className="panel-region__title">{title}</h4>
      {children ?? <p className="panel-region__hint">{hint}</p>}
    </section>
  )
}
