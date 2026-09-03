import { lazy, type ComponentType } from 'react'

const loadProfileTabs = () => import('./pages/ProfileTabs')
const FeedTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.FeedTab })))
const LabelsTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.LabelsTab })))
const LabeledPostsTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.LabeledPostsTab })))
const BlockingTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.BlockingTab })))
const BlockedByTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.BlockedByTab })))
const ListsTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.ListsTab })))
const ListedOnTab = lazy(() => loadProfileTabs().then((module) => ({ default: module.ListedOnTab })))

export type ProfileTabSlug = 'labels' | 'labeled-posts' | 'blocking' | 'blocked-by' | 'lists' | 'listed-on'

export type ProfileTabDefinition = {
  id: 'feed' | ProfileTabSlug
  label: string
  path: ProfileTabSlug | null
  component: ComponentType
}

export const PROFILE_TABS: readonly ProfileTabDefinition[] = [
  { id: 'feed', label: 'Feed', path: null, component: FeedTab },
  { id: 'labels', label: 'Account labels', path: 'labels', component: LabelsTab },
  { id: 'labeled-posts', label: 'Labeled posts', path: 'labeled-posts', component: LabeledPostsTab },
  { id: 'blocking', label: 'Blocking', path: 'blocking', component: BlockingTab },
  { id: 'blocked-by', label: 'Blocked by', path: 'blocked-by', component: BlockedByTab },
  { id: 'lists', label: 'Lists', path: 'lists', component: ListsTab },
  { id: 'listed-on', label: 'Listed on', path: 'listed-on', component: ListedOnTab },
]
