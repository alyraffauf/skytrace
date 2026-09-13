import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '../layouts/AppLayout'
import { RouteError } from './RouteError'
import { HomePage } from '../pages/HomePage'
import { PROFILE_TABS, type ProfileTabSlug } from './profileTabs'

const ProfileLayout = lazy(() =>
  import('../layouts/ProfileLayout').then((module) => ({ default: module.ProfileLayout })),
)
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
} satisfies Record<'feed' | ProfileTabSlug, ComponentType>

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'list/:actor/:rkey', element: <ListPage /> },
      {
        path: 'profile/:actor',
        element: <ProfileLayout />,
        children: [
          ...PROFILE_TABS.map(({ id, path }) => {
            const Component = profilePages[id]
            return path ? { path, element: <Component /> } : { index: true, element: <Component />, id }
          }),
          { path: 'feed', element: <Navigate to=".." relative="path" replace /> },
        ],
      },
    ],
  },
])
