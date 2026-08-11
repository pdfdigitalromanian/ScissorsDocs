import { Icon } from '@/components/icons/Icon'
import { useTheme } from '@/hooks/useTheme'

interface ThemeMenuProps {
  className?: string
}

/**
 * Shared one-click theme control used outside the entry page. It mirrors the
 * entry-header interaction: the icon shows the theme that clicking will apply.
 */
export function ThemeMenu({ className = '' }: ThemeMenuProps) {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className={className}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size="sm" aria-hidden="true" />
    </button>
  )
}
