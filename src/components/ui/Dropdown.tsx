import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'
import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { focusFirstFocusable } from './focus'
import './overlays.css'

type DropdownAlign = 'start' | 'end'

interface DropdownContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  align: DropdownAlign
  triggerId: string
  menuId: string
  triggerRef: React.RefObject<HTMLButtonElement | null>
  menuRef: React.RefObject<HTMLDivElement | null>
}

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdownContext(): DropdownContextValue {
  const context = useContext(DropdownContext)
  if (!context) {
    throw new Error('Dropdown components must be rendered inside <Dropdown>')
  }
  return context
}

interface DropdownProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  align?: DropdownAlign
  children: ReactNode
  className?: string
}

export function Dropdown({
  open,
  defaultOpen = false,
  onOpenChange,
  align = 'start',
  children,
  className = '',
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const triggerId = useId()
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  return (
    <DropdownContext.Provider
      value={{
        open: isOpen,
        setOpen,
        align,
        triggerId,
        menuId,
        triggerRef,
        menuRef,
      }}
    >
      <div className={`dropdown${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

interface DropdownTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

export function DropdownTrigger({
  children,
  className = '',
  ...rest
}: DropdownTriggerProps) {
  const { open, setOpen, triggerId, triggerRef } = useDropdownContext()

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault()
      setOpen(true)
    }
    rest.onKeyDown?.(event)
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      id={triggerId}
      className={`dropdown__trigger${className ? ` ${className}` : ''}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      {...rest}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  )
}

interface DropdownMenuProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function DropdownMenu({
  children,
  className = '',
  ...rest
}: DropdownMenuProps) {
  const { open, setOpen, align, menuId, triggerRef, menuRef } =
    useDropdownContext()

  useEffect(() => {
    if (!open) return

    if (menuRef.current) focusFirstFocusable(menuRef.current)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return
      setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open, setOpen, triggerRef, menuRef])

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)',
      ),
    )
    if (items.length === 0) return

    const currentIndex = items.indexOf(document.activeElement as HTMLElement)

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        items[(currentIndex + 1) % items.length]?.focus()
        break
      case 'ArrowUp':
        event.preventDefault()
        items[(currentIndex - 1 + items.length) % items.length]?.focus()
        break
      case 'Home':
        event.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        items[items.length - 1]?.focus()
        break
      case 'Tab':
        setOpen(false)
        return
      default:
        rest.onKeyDown?.(event)
        return
    }

    rest.onKeyDown?.(event)
  }

  if (!open) return null

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      className={`dropdown__menu dropdown__menu--${align}${
        className ? ` ${className}` : ''
      }`}
      onKeyDown={handleMenuKeyDown}
      {...rest}
    >
      {children}
    </div>
  )
}

interface DropdownItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName
  danger?: boolean
  onSelect?: () => void
  children: ReactNode
}

export function DropdownItem({
  icon,
  danger = false,
  onSelect,
  children,
  className = '',
  ...rest
}: DropdownItemProps) {
  const { setOpen } = useDropdownContext()

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    rest.onClick?.(event)
    onSelect?.()
    setOpen(false)
  }

  return (
    <button
      type="button"
      role="menuitem"
      className={`dropdown__item${danger ? ' dropdown__item--danger' : ''}${
        className ? ` ${className}` : ''
      }`}
      {...rest}
      onClick={handleClick}
    >
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </button>
  )
}

export function DropdownLabel({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`dropdown__label${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </span>
  )
}

export function DropdownSeparator({ className = '' }: { className?: string }) {
  return (
    <span
      role="separator"
      className={`dropdown__separator${className ? ` ${className}` : ''}`}
    />
  )
}
