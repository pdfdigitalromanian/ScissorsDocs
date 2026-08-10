import { useCallback, useEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react'
import IconButton from '@/components/ui/IconButton'
import { Icon } from '@/components/icons/Icon'
import { DOCUMENT_PANEL_ID, getTabElementId } from '../config'
import { useWorkspace } from '../state/use-workspace'

/**
 * DocumentTabs is the tab strip of open documents. It supports closable
 * tabs, an active state and horizontal overflow with scroll controls, and
 * follows the WAI-ARIA tabs pattern (roving tabindex + arrow navigation).
 */
export function DocumentTabs() {
  const { tabs, activeTabId, activateTab, closeTab } = useWorkspace()
  const listRef = useRef<HTMLDivElement>(null)
  const [canScrollStart, setCanScrollStart] = useState(false)
  const [canScrollEnd, setCanScrollEnd] = useState(false)

  const updateOverflow = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const hasOverflow = list.scrollWidth > list.clientWidth + 1
    setCanScrollStart(hasOverflow && list.scrollLeft > 1)
    setCanScrollEnd(
      hasOverflow && list.scrollLeft < list.scrollWidth - list.clientWidth - 1,
    )
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(list)
    list.addEventListener('scroll', updateOverflow, { passive: true })
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', updateOverflow)
    }
  }, [updateOverflow])

  useEffect(() => {
    const frame = requestAnimationFrame(updateOverflow)
    return () => cancelAnimationFrame(frame)
  }, [tabs, updateOverflow])

  const scrollByPage = (direction: 1 | -1) => {
    const list = listRef.current
    if (!list) return
    list.scrollBy({ left: list.clientWidth * direction })
  }

  const applyRovingTabIndex = (focused: HTMLButtonElement) => {
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
        [],
    )
    buttons.forEach((button) => {
      button.tabIndex = button === focused ? 0 : -1
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
        [],
    )
    if (buttons.length === 0) return
    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    )
    let nextIndex = -1

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        nextIndex =
          currentIndex < 0
            ? buttons.length - 1
            : (currentIndex - 1 + buttons.length) % buttons.length
        break
      case 'Home':
        event.preventDefault()
        nextIndex = 0
        break
      case 'End':
        event.preventDefault()
        nextIndex = buttons.length - 1
        break
    }

    if (nextIndex >= 0) {
      const next = buttons[nextIndex]
      applyRovingTabIndex(next)
      next.focus()
    }
  }

  const handleTabFocus = (event: FocusEvent<HTMLButtonElement>) => {
    applyRovingTabIndex(event.currentTarget)
  }

  const handleClose = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    event.stopPropagation()
    closeTab(tabId)
  }

  return (
    <div className="document-tabs">
      {canScrollStart && (
        <IconButton
          icon="chevron-left"
          label="Scroll tabs backward"
          iconSize="sm"
          className="document-tabs__scroll"
          onClick={() => scrollByPage(-1)}
        />
      )}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Open documents"
        className="document-tabs__list"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          const tabId = getTabElementId(tab.id)
          return (
            <div
              key={tab.id}
              className={`document-tab${active ? ' document-tab--active' : ''}`}
            >
              <button
                type="button"
                role="tab"
                id={tabId}
                aria-selected={active}
                aria-controls={DOCUMENT_PANEL_ID}
                tabIndex={active ? 0 : -1}
                className="document-tab__trigger"
                onClick={() => activateTab(tab.id)}
                onFocus={handleTabFocus}
              >
                <Icon name={tab.icon ?? 'file-text'} size="sm" />
                <span className="document-tab__label">{tab.title}</span>
              </button>
              <IconButton
                icon="close"
                label={`Close ${tab.title}`}
                iconSize="sm"
                className="document-tab__close"
                onClick={(event) => handleClose(event, tab.id)}
              />
            </div>
          )
        })}
      </div>
      {canScrollEnd && (
        <IconButton
          icon="chevron-right"
          label="Scroll tabs forward"
          iconSize="sm"
          className="document-tabs__scroll"
          onClick={() => scrollByPage(1)}
        />
      )}
    </div>
  )
}
