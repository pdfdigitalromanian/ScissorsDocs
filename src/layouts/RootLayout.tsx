import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { LoadingState } from '@/components/layout'
import { ToastProvider, ToastViewport } from '@/components/ui'
import { ThemeProvider } from '@/hooks/useTheme'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import './root-layout.css'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SettingsProvider>
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
