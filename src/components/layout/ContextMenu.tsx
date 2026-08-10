import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { getTokenSpace } from './space'
import './layout-floating.css'

export interface ContextMenuItem {
  label: string
  icon?: IconName
  disabled?: boolean
  destructive?: boolean
  onSelect?: () => void
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  children: ReactNode
  ariaLabel?: string
  className?: string
}

interface Position {
  top: number
  left: number
}

function getMenuItems(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('.context-menu__item'),
  ).filter((item) => !item.disabled)
}

/**
 * ContextMenu opens a keyboard-operable menu at the pointer position
 * on right-click. The menu is fully keyboard accessible (arrow keys,
 * Home/End, Enter, Escape) and closes on outside click or scroll.
 */
export default function ContextMenu({
  items,
  children,
  ariaLabel = 'Context menu',
  className = '',
}: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const closeMenu = useCallback(() => {
    setOpen(false)
    setReady(false)
    previousFocusRef.current?.focus()
  }, [])

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    previousFocusRef.current = document.activeElement as HTMLElement | null
    setPosition({ top: event.clientY, left: event.clientX })
    setReady(false)
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return

    const rect = menu.getBoundingClientRect()
    const margin = getTokenSpace()
    const clampedTop = Math.min(
      position.top,
      window.innerHeight - rect.height - margin,
    )
    const clampedLeft = Math.min(
      position.left,
      window.innerWidth - rect.width - margin,
    )
    if (clampedTop !== position.top || clampedLeft !== position.left) {
      setPosition({ top: clampedTop, left: clampedLeft })
    }

    const firstItem = getMenuItems(menu)[0]
    if (firstItem) {
      firstItem.focus()
      getMenuItems(menu).forEach((item, index) => {
        item.tabIndex = index === 0 ? 0 : -1
      })
    }
    setReady(true)
  }, [open, position])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }

    const handleReposition = () => closeMenu()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [open, closeMenu])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current
    if (!menu) return
    const items = getMenuItems(menu)
    if (items.length === 0) return

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    )
    let nextIndex = -1

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
        break
      case 'ArrowUp':
        event.preventDefault()
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
        break
      case 'Home':
        event.preventDefault()
        nextIndex = 0
        break
      case 'End':
        event.preventDefault()
        nextIndex = items.length - 1
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        return
      case 'Tab':
        closeMenu()
        return
    }

    if (nextIndex >= 0) items[nextIndex].focus()
  }

  return (
    <>
      <div
        className={`context-menu__trigger${className ? ` ${className}` : ''}`}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel}
            className={`context-menu${ready ? ' context-menu--ready' : ''}`}
            style={{ top: position.top, left: position.left }}
            onKeyDown={handleKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`context-menu__item${
                  item.destructive ? ' context-menu__item--destructive' : ''
                }`}
                onClick={() => {
                  if (item.disabled) return
                  closeMenu()
                  item.onSelect?.()
                }}
              >
                {item.icon && (
                  <span className="context-menu__item-icon" aria-hidden="true">
                    <Icon name={item.icon} size="sm" />
                  </span>
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
