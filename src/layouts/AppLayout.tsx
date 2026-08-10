import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '@/features/shell/components/Header'
import Sidebar from '@/features/shell/components/Sidebar'
import { LoadingState } from '@/components/layout'
import '../features/shell/shell.css'
import './app-layout.css'

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const openDrawer = useCallback(() => setDrawerOpen(true), [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!drawerOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerOpen, closeDrawer])

  return (
    <div className="app-shell">
      <Header onOpenDrawer={openDrawer} menuButtonRef={menuButtonRef} />

      <Sidebar
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onCloseDrawer={closeDrawer}
      />

      <main id="main-content" className="app-shell__main" tabIndex={-1}>
        <Suspense fallback={<LoadingState label="Loading page" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
