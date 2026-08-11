import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '@/components/icons/Icon'
import { useToast } from '@/components/ui'
import Brand from '@/features/shell/components/Brand'
import { useTheme } from '@/hooks/useTheme'
import { homeToolCategories } from '../data/home-catalog'

export default function EntryHeader() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsMenuRef = useRef<HTMLElement>(null)
  const toolsButtonRef = useRef<HTMLButtonElement>(null)
  const { toast } = useToast()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    if (!toolsOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (toolsMenuRef.current?.contains(target)) return
      if (toolsButtonRef.current?.contains(target)) return
      setToolsOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setToolsOpen(false)
        toolsButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [toolsOpen])

  function handleContactClick() {
    toast({
      title: 'Contact ScissorsDoc',
      description: 'Contact options will be connected in the next phase.',
      variant: 'info',
    })
  }

  return (
    <header className="entry-header">
      <div className="entry-header__inner">
        <Brand />

        <nav className="entry-header__nav" aria-label="Entry navigation">
          <button
            ref={toolsButtonRef}
            type="button"
            className={`entry-header__nav-button${toolsOpen ? ' entry-header__nav-button--active' : ''}`}
            aria-expanded={toolsOpen}
            aria-controls="entry-tools-menu"
            onClick={() => setToolsOpen((open) => !open)}
          >
            <Icon name="workspace" size="sm" aria-hidden="true" />
            <span>Tools</span>
            <Icon
              name={toolsOpen ? 'chevron-up' : 'chevron-down'}
              size="xs"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="entry-header__nav-button entry-header__contact"
            onClick={handleContactClick}
          >
            Contact us
          </button>
        </nav>

        <div className="entry-header__actions">
          <button
            type="button"
            className="entry-header__theme"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
          >
            <Icon
              name={theme === 'dark' ? 'sun' : 'moon'}
              size="sm"
              aria-hidden="true"
            />
          </button>
          <Link className="entry-header__workspace" to="/workspace">
            Open workspace
            <Icon name="arrow-right" size="sm" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {toolsOpen ? (
        <>
          <button
            type="button"
            className="entry-tools__backdrop"
            aria-label="Close tools menu"
            onClick={() => setToolsOpen(false)}
          />
          <section
            ref={toolsMenuRef}
            id="entry-tools-menu"
            className="entry-tools"
            aria-label="Document tools"
          >
            <div className="entry-tools__inner">
              {homeToolCategories.map((category) => (
                <section
                  key={category.id}
                  className="entry-tools__category"
                  aria-labelledby={`entry-tools-${category.id}`}
                >
                  <div className="entry-tools__category-heading">
                    <span
                      className={`home-icon home-icon--sm home-icon--${category.tone}`}
                      aria-hidden="true"
                    >
                      <Icon name={category.icon} size="sm" />
                    </span>
                    <h2 id={`entry-tools-${category.id}`}>{category.label}</h2>
                  </div>
                  <div className="entry-tools__list">
                    {category.tools.map((tool) => (
                      <Link
                        key={tool.id}
                        className="entry-tools__item"
                        to={`/tools/${tool.id}`}
                        onClick={() => setToolsOpen(false)}
                      >
                        <span
                          className={`home-icon home-icon--sm home-icon--${tool.tone}`}
                          aria-hidden="true"
                        >
                          <Icon name={tool.icon} size="sm" />
                        </span>
                        <span className="entry-tools__item-copy">
                          <span className="entry-tools__item-label">
                            {tool.label}
                          </span>
                          <span className="entry-tools__item-description">
                            {tool.description}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </header>
  )
}
