import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'scissordoc-theme'
const SYSTEM_QUERY = '(prefers-color-scheme: dark)'
const THEME_COLOR_LIGHT = '#ffffff'
const THEME_COLOR_DARK = '#0b1120'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light'
  }
  return preference
}

/**
 * Applies the resolved theme and preference to the document. Called by the
 * provider and mirrored by the inline FOUC script in index.html so the
 * correct theme is in place before the first paint.
 */
export function applyTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePreference = preference

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT)
}

interface ThemeContextValue {
  /** The resolved theme actually applied to the document. */
  theme: ResolvedTheme
  /** The user's stored preference ('system' by default). */
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  children: ReactNode
}

/**
 * ThemeProvider owns the application theme. It resolves the 'system'
 * preference against the OS setting, follows live OS changes, persists the
 * preference to localStorage and exposes a stable API to consumers.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(SYSTEM_QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const theme: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    applyTheme(preference, theme)
  }, [preference, theme])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setPreferenceState((current) => {
      const resolved = current === 'system' ? (systemDark ? 'dark' : 'light') : current
      return resolved === 'dark' ? 'light' : 'dark'
    })
  }, [systemDark])

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, setPreference, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
