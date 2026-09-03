import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RouteError } from './components/States'
import { HomePage } from './pages/HomePage'
import { queryClient } from './lib/queryClient'
import './index.css'
import { PROFILE_TABS } from './profileTabRoutes'

const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const ListPage = lazy(() => import('./pages/ListPage').then((module) => ({ default: module.ListPage })))

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'list/:actor/:rkey', element: <ListPage /> },
      {
        path: 'profile/:actor',
        element: <ProfilePage />,
        children: [
          ...PROFILE_TABS.map(({ id, path, component: Component }) =>
            path ? { path, element: <Component /> } : { index: true, element: <Component />, id },
          ),
          { path: 'feed', element: <Navigate to=".." relative="path" replace /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-5 py-12" aria-label="Loading page">
          <div className="skeleton h-20 w-full" />
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  </QueryClientProvider>,
)
