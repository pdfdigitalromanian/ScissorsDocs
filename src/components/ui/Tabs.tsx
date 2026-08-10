import { createContext, useContext, useState, useId } from 'react'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from 'react'
import './navigation.css'

interface TabsContextValue {
  value: string
  baseId: string
  onSelect: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tab components must be rendered inside <Tabs>')
  }
  return context
}

interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: ReactNode
  className?: string
}

export function Tabs({
  value,
  defaultValue = '',
  onValueChange,
  children,
  className = '',
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const baseId = useId()
  const currentValue = value ?? internalValue

  const handleSelect = (next: string) => {
    if (value === undefined) setInternalValue(next)
    onValueChange?.(next)
  }

  return (
    <div className={`tabs${className ? ` ${className}` : ''}`}>
      <TabsContext.Provider
        value={{ value: currentValue, baseId, onSelect: handleSelect }}
      >
        {children}
      </TabsContext.Provider>
    </div>
  )
}

interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function TabsList({
  children,
  'aria-label': ariaLabel,
  ...rest
}: TabsListProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ),
    )
    if (tabs.length === 0) return

    const currentIndex = tabs.indexOf(
      document.activeElement as HTMLButtonElement,
    )

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        tabs[(currentIndex + 1) % tabs.length]?.focus()
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        tabs[(currentIndex - 1 + tabs.length) % tabs.length]?.focus()
        return
      case 'Home':
        event.preventDefault()
        tabs[0]?.focus()
        return
      case 'End':
        event.preventDefault()
        tabs[tabs.length - 1]?.focus()
        return
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="tabs__list"
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  )
}

interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'id'> {
  value: string
  children: ReactNode
}

export function Tab({ value, children, ...rest }: TabProps) {
  const { value: activeValue, baseId, onSelect } = useTabsContext()
  const selected = activeValue === value
  const tabId = `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel-${value}`

  return (
    <button
      type="button"
      id={tabId}
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      className={`tabs__tab${selected ? ' tabs__tab--active' : ''}`}
      onClick={() => onSelect(value)}
      {...rest}
    >
      {children}
    </button>
  )
}

interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string
  children: ReactNode
}

export function TabPanel({ value, children, ...rest }: TabPanelProps) {
  const { value: activeValue, baseId } = useTabsContext()
  const selected = activeValue === value
  const tabId = `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel-${value}`

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      className="tabs__panel"
      tabIndex={0}
      hidden={!selected}
      {...rest}
    >
      {children}
    </div>
  )
}
