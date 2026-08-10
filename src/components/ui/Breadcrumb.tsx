import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import './navigation.css'

interface BreadcrumbItem {
  label: ReactNode
  href?: string
  to?: string
  icon?: IconName
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
  separator?: ReactNode
  'aria-label'?: string
}

export default function Breadcrumb({
  items,
  className = '',
  separator,
  'aria-label': ariaLabel = 'Breadcrumb',
}: BreadcrumbProps) {
  const lastIndex = items.length - 1

  return (
    <nav
      className={`breadcrumb${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    >
      <ol className="breadcrumb__list">
        {items.map((item, index) => {
          const isCurrent = index === lastIndex

          return (
            <li key={index} className="breadcrumb__item">
              {index > 0 && (
                <span className="breadcrumb__separator" aria-hidden="true">
                  {separator ?? <Icon name="chevron-right" size="xs" />}
                </span>
              )}
              {item.href && !isCurrent ? (
                <a className="breadcrumb__link" href={item.href}>
                  {item.icon && <Icon name={item.icon} size="xs" />}
                  {item.label}
                </a>
              ) : item.to && !isCurrent ? (
                <Link className="breadcrumb__link" to={item.to}>
                  {item.icon && <Icon name={item.icon} size="xs" />}
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`breadcrumb__link${
                    isCurrent ? ' breadcrumb__link--current' : ''
                  }`}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {item.icon && <Icon name={item.icon} size="xs" />}
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
