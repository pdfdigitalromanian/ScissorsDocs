import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import SidebarNav from './SidebarNav'

interface SidebarProps {
  collapsed: boolean
  drawerOpen: boolean
  onToggleCollapsed: () => void
  onCloseDrawer: () => void
}

export default function Sidebar({
  collapsed,
  drawerOpen,
  onToggleCollapsed,
  onCloseDrawer,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (drawerOpen) {
      sidebarRef.current?.focus()
    }
  }, [drawerOpen])

  return (
    <>
      <div
        className={`sidebar__overlay${drawerOpen ? ' sidebar__overlay--visible' : ''}`}
        onClick={onCloseDrawer}
        aria-hidden="true"
      />
      <aside
        ref={sidebarRef}
        id="app-sidebar"
        tabIndex={-1}
        aria-label="Primary navigation"
        className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${drawerOpen ? ' sidebar--drawer-open' : ''}`}
      >
        <div className="sidebar__header">
          <span className="sidebar__title">Menu</span>
          <IconButton
            icon="close"
            label="Close navigation menu"
            className="sidebar__close"
            iconSize="sm"
            onClick={onCloseDrawer}
          />
        </div>

        <SidebarNav collapsed={collapsed} />

        <div className="sidebar__footer">
          <Link
            className="sidebar__sindura"
            to="/sindura"
            title="Open the style guide"
            aria-label="Open the style guide"
          >
            <Icon name="swatch" size="sm" />
            <span className="sidebar__sindura-label">Style guide</span>
          </Link>
          <IconButton
            icon="panel-left"
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar__collapse"
            iconSize="sm"
            onClick={onToggleCollapsed}
            aria-pressed={collapsed}
          />
        </div>
      </aside>
    </>
  )
}
