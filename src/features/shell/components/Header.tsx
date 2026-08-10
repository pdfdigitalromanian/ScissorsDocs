import { useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Icon } from '@/components/icons/Icon'
import IconButton from '@/components/ui/IconButton'
import { ThemeMenu } from '@/components/ui/ThemeMenu'
import Brand from './Brand'

interface HeaderProps {
  onOpenDrawer: () => void
  menuButtonRef?: Ref<HTMLButtonElement>
}

const MOBILE_QUERY = '(max-width: 640px)'

export default function Header({ onOpenDrawer, menuButtonRef }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus()
    }
  }, [searchOpen])

  function handleSearchClick() {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setSearchOpen((open) => !open)
    } else {
      searchInputRef.current?.focus()
    }
  }

  function handleSearchBlur() {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setSearchOpen(false)
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSearchOpen(false)
      searchInputRef.current?.blur()
    }
  }

  return (
    <header className="header">
      <div className="header__group header__group--brand">
        <IconButton
          icon="menu"
          label="Open navigation menu"
          className="header__menu-button"
          iconSize="sm"
          onClick={onOpenDrawer}
          buttonRef={menuButtonRef}
        />
        <Brand />
      </div>

      <div className="header__group header__group--actions">
        <div
          className={`header__search${searchOpen ? ' header__search--open' : ''}`}
          role="search"
          onClick={handleSearchClick}
        >
          <Icon name="search" size="sm" />
          <input
            ref={searchInputRef}
            type="search"
            className="header__search-input"
            placeholder="Search documents"
            aria-label="Search documents"
            autoComplete="off"
            onBlur={handleSearchBlur}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <ThemeMenu className="header__theme" />
        <IconButton
          icon="bell"
          label="Notifications (coming soon)"
          iconSize="sm"
          className="header__action header__action--secondary"
        />
        <IconButton
          icon="settings"
          label="Settings (coming soon)"
          iconSize="sm"
          className="header__action header__action--secondary"
        />
      </div>
    </header>
  )
}
