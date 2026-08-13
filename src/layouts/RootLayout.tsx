import { Suspense, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LoadingState } from '@/components/layout'
import { ToastProvider, ToastViewport } from '@/components/ui'
import { ThemeProvider } from '@/hooks/useTheme'
import { SettingsProvider, useSettings } from '@/features/settings/SettingsProvider'
import './root-layout.css'

/** Honors the General → Startup behavior setting on first load. */
function StartupRedirect() {
  const { settings } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (settings.general.startup === 'workspace' && location.pathname === '/') {
      navigate('/workspace', { replace: true })
    }
  }, [settings.general.startup, location.pathname, navigate])

  return null
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <StartupRedirect />
        <ToastProvider>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <Suspense fallback={<LoadingState label="Loading" />}>
            <Outlet />
          </Suspense>
          <ToastViewport />
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}
