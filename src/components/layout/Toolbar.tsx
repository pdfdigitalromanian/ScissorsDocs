import { useEffect, useRef } from 'react'
import type {
  FocusEvent as ReactFocusEvent,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import './layout-toolbar.css'

export type ToolbarOrientation = 'horizontal' | 'vertical'

interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  ariaLabel: string
  orientation?: ToolbarOrientation
  bare?: boolean
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function getToolbarItems(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => !element.hasAttribute('disabled'))
}

function moveFocus(items: HTMLElement[], index: number) {
  items.forEach((item, itemIndex) => {
    item.tabIndex = itemIndex === index ? 0 : -1
  })
  items[index].focus()
}

/**
 * Toolbar is an accessible toolbar landmark (role="toolbar") with
 * roving tabindex and arrow-key navigation between its controls.
 */
export function Toolbar({
  ariaLabel,
  orientation = 'horizontal',
  bare = false,
  children,
  onKeyDown,
  onFocus,
  className = '',
  ...rest
}: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const toolbar = toolbarRef.current
    if (!toolbar) return
    const items = getToolbarItems(toolbar)
    if (items.length > 0 && !items.some((item) => item.tabIndex === 0)) {
      items[0].tabIndex = 0
    }
  }, [])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return

    const toolbar = toolbarRef.current
    if (!toolbar) return
    const items = getToolbarItems(toolbar)
    if (items.length === 0) return

    const currentIndex = items.indexOf(document.activeElement as HTMLElement)
    const backwardKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const forwardKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    let nextIndex = -1

    switch (event.key) {
      case backwardKey:
        event.preventDefault()
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
        break
      case forwardKey:
        event.preventDefault()
        nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1
        break
      case 'Home':
        event.preventDefault()
        nextIndex = 0
        break
      case 'End':
        event.preventDefault()
        nextIndex = items.length - 1
        break
    }

    if (nextIndex >= 0) moveFocus(items, nextIndex)
  }

  const handleFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    onFocus?.(event)
    const toolbar = toolbarRef.current
    if (!toolbar) return
    const target = event.target as HTMLElement
    if (target === toolbar) return
    const items = getToolbarItems(toolbar)
    if (!items.includes(target)) return
    items.forEach((item) => {
      item.tabIndex = item === target ? 0 : -1
    })
  }

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={`toolbar${orientation === 'vertical' ? ' toolbar--vertical' : ''}${
        bare ? ' toolbar--bare' : ''
      }${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      {...rest}
    >
      {children}
    </div>
  )
}

export function ToolbarGroup({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`toolbar__group${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}

interface ToolbarDividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal'
}

export function ToolbarDivider({
  orientation = 'vertical',
  className = '',
  ...rest
}: ToolbarDividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`toolbar__divider${
        orientation === 'horizontal' ? ' toolbar__divider--horizontal' : ''
      }${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
