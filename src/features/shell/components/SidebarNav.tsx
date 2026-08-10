import { NavLink } from 'react-router-dom'
import { appRoutes } from '@/app/routes'
import { Icon } from '@/components/icons/Icon'

interface SidebarNavProps {
  collapsed: boolean
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
}

export default function SidebarNav({ collapsed }: SidebarNavProps) {
  return (
    <nav className="sidebar__nav" aria-label="Primary">
      <ul className="sidebar__list">
        {appRoutes.map((route) => (
          <li key={route.path}>
            <NavLink
              to={route.path}
              end={route.path === '/'}
              className={navLinkClass}
              title={collapsed ? route.label : undefined}
            >
              <Icon name={route.icon} size="sm" />
              <span className="sidebar__link-label">{route.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
