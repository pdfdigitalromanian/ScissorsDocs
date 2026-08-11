import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import RootLayout from '@/layouts/RootLayout'
import { appRoutes } from '@/app/routes'

const HomePage = lazy(() => import('@/pages/HomePage'))
const LibraryPage = lazy(() => import('@/pages/LibraryPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const PlaceholderPage = lazy(() => import('@/pages/PlaceholderPage'))
const ToolPage = lazy(() => import('@/pages/ToolPage'))
const ToolsPage = lazy(() => import('@/pages/ToolsPage'))
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'))
const SinduraGuidePage = lazy(() => import('@/sindura-guide/SinduraGuidePage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        element: <AppLayout />,
        children: [
          { path: '/tools', element: <ToolsPage /> },
          { path: '/tools/:toolId', element: <ToolPage /> },
          ...appRoutes
            .filter((route) => route.path !== '/' && route.path !== '/tools')
            .map((route) => ({
              path: route.path,
              element:
                route.path === '/workspace' ? (
                  <WorkspacePage />
                ) : route.path === '/recent' || route.path === '/favorites' ? (
                  <LibraryPage />
                ) : (
                  <PlaceholderPage
                    title={route.label}
                    description={route.description}
                    icon={route.icon}
                  />
                ),
            })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: 'sindura', element: <SinduraGuidePage /> },
    ],
  },
])
