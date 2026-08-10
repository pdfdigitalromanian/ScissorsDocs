import type { HTMLAttributes, ReactNode } from 'react'
import './layout-workspace.css'

interface WorkspaceLayoutProps extends HTMLAttributes<HTMLDivElement> {
  toolbar?: ReactNode
  inspector?: ReactNode
  properties?: ReactNode
  bottom?: ReactNode
  children?: ReactNode
}

/**
 * WorkspaceLayout arranges the toolbar, document stage and side panels
 * into the workspace grid. Absent regions collapse and reserve no space,
 * so future panels (PDF viewer, AI chat, properties, thumbnails,
 * outline, console) can be added without restructuring.
 */
export default function WorkspaceLayout({
  toolbar,
  inspector,
  properties,
  bottom,
  children,
  className = '',
  ...rest
}: WorkspaceLayoutProps) {
  return (
    <div
      className={`workspace-layout${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {toolbar && <div className="workspace-layout__toolbar">{toolbar}</div>}
      {inspector && (
        <div className="workspace-layout__inspector">{inspector}</div>
      )}
      <div className="workspace-layout__stage">{children}</div>
      {properties && (
        <div className="workspace-layout__properties">{properties}</div>
      )}
      {bottom && <div className="workspace-layout__bottom">{bottom}</div>}
    </div>
  )
}
