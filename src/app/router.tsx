import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import RootLayout from '@/layouts/RootLayout'
import { appRoutes } from '@/app/routes'

const HomePage = lazy(() => import('@/pages/HomePage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const PlaceholderPage = lazy(() => import('@/pages/PlaceholderPage'))
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'))
const SinduraGuidePage = lazy(() => import('@/sindura-guide/SinduraGuidePage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          ...appRoutes
            .filter((route) => route.path !== '/')
            .map((route) => ({
              path: route.path,
              element:
                route.path === '/workspace' ? (
                  <WorkspacePage />
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
