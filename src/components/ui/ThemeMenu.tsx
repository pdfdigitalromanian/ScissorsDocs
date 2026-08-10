import { Icon } from '@/components/icons/Icon'
import type { IconName } from '@/components/icons/Icon'
import { useTheme } from '@/hooks/useTheme'
import type { ThemePreference } from '@/hooks/useTheme'
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownLabel,
} from './Dropdown'
import './overlays.css'

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

interface ThemeMenuProps {
  className?: string
}

/**
 * ThemeMenu is a dropdown for choosing between Light, Dark and System
 * themes. The current preference is reflected with aria-checked, and the
 * trigger icon mirrors the resolved theme so the affordance stays
 * recognizable at a glance.
 */
export function ThemeMenu({ className = '' }: ThemeMenuProps) {
  const { theme, preference, setPreference } = useTheme()

  return (
    <Dropdown align="end" className={className}>
      <DropdownTrigger aria-label="Theme" title="Theme">
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} size="sm" />
      </DropdownTrigger>
      <DropdownMenu>
        <DropdownLabel>Theme</DropdownLabel>
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option.value
          return (
            <DropdownItem
              key={option.value}
              role="menuitemradio"
              aria-checked={selected}
              icon={option.icon}
              onClick={() => setPreference(option.value)}
            >
              <span className="theme-menu__label">{option.label}</span>
              {selected && <Icon name="check" size="sm" />}
            </DropdownItem>
          )
        })}
      </DropdownMenu>
    </Dropdown>
  )
}
