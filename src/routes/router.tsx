import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { RouteError } from './RouteError'
import { HomePage } from '../pages/HomePage'
import type { RouteHandle } from './metadata'
import { PROFILE_TABS, type ProfileTabId } from './profileTabs'

const ProfileLayout = lazy(() =>
  import('../layouts/ProfileLayout').then((module) => ({ default: module.ProfileLayout })),
)
const FaqPage = lazy(() => import('../pages/FaqPage').then((module) => ({ default: module.FaqPage })))
const ListPage = lazy(() => import('../pages/ListPage').then((module) => ({ default: module.ListPage })))

const profilePages = {
  feed: lazy(() => import('../pages/profile/FeedPage').then((module) => ({ default: module.FeedPage }))),
  labels: lazy(() =>
    import('../pages/profile/AccountLabelsPage').then((module) => ({ default: module.AccountLabelsPage })),
  ),
  'labeled-posts': lazy(() =>
    import('../pages/profile/LabeledPostsPage').then((module) => ({ default: module.LabeledPostsPage })),
  ),
  blocking: lazy(() => import('../pages/profile/BlockingPage').then((module) => ({ default: module.BlockingPage }))),
  'blocked-by': lazy(() =>
    import('../pages/profile/BlockedByPage').then((module) => ({ default: module.BlockedByPage })),
  ),
  lists: lazy(() => import('../pages/profile/ListsPage').then((module) => ({ default: module.ListsPage }))),
  'listed-on': lazy(() => import('../pages/profile/ListedOnPage').then((module) => ({ default: module.ListedOnPage }))),
} satisfies Record<ProfileTabId, ComponentType>

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage />, handle: { presentation: 'home' } satisfies RouteHandle },
      { path: 'faq', element: <FaqPage /> },
      { path: 'list/:actor/:rkey', element: <ListPage />, handle: { presentation: 'explorer' } satisfies RouteHandle },
      {
        path: 'profile/:actor',
        element: <ProfileLayout />,
        handle: { presentation: 'explorer' } satisfies RouteHandle,
        children: [
          ...PROFILE_TABS.map((tab) => {
            const { id } = tab
            const handle = { profileTab: tab } satisfies RouteHandle
            const Component = profilePages[id]
            return id === 'feed'
              ? { index: true, element: <Component />, id, handle }
              : { path: id, element: <Component />, handle }
          }),
          { path: 'feed', element: <Navigate to=".." relative="path" replace /> },
        ],
      },
    ],
  },
])
