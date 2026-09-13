import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { RouteError } from './RouteError'
import { HomePage } from '../pages/HomePage'
import { PROFILE_TABS } from './profileTabs'

const ProfilePage = lazy(() =>
  import('../pages/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })),
)
const ListPage = lazy(() => import('../pages/ListPage').then((module) => ({ default: module.ListPage })))

export const router = createBrowserRouter([
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
