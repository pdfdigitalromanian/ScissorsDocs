import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { AppSettings } from './store'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './store'

/** Partial update shape that mirrors the nested settings tree. */
export type SettingsPatch = {
  general?: Partial<AppSettings['general']>
  viewer?: Partial<AppSettings['viewer']>
  editor?: Partial<Omit<AppSettings['editor'], 'text' | 'shape'>> & {
    text?: Partial<AppSettings['editor']['text']>
    shape?: Partial<AppSettings['editor']['shape']>
  }
  workspace?: Partial<AppSettings['workspace']>
}

interface SettingsContextValue {
  settings: AppSettings
  updateSettings: (patch: SettingsPatch) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  const persist = useCallback((next: AppSettings) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => saveSettings(next), 150)
  }, [])

  const updateSettings = useCallback(
    (patch: SettingsPatch) => {
      setSettings((prev) => {
        const next: AppSettings = {
          general: { ...prev.general, ...patch.general },
          viewer: { ...prev.viewer, ...patch.viewer },
          editor: {
            ...prev.editor,
            ...patch.editor,
            text: { ...prev.editor.text, ...patch.editor?.text },
            shape: { ...prev.editor.shape, ...patch.editor?.shape },
          },
          workspace: { ...prev.workspace, ...patch.workspace },
        }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    persist(DEFAULT_SETTINGS)
  }, [persist])

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [settings, updateSettings, resetSettings],
  )

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
