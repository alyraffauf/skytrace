export type ProfileTabSlug = 'labels' | 'labeled-posts' | 'blocking' | 'blocked-by' | 'lists' | 'listed-on'

type ProfileTabDefinition = {
  id: 'feed' | ProfileTabSlug
  label: string
  path: ProfileTabSlug | null
}

export const PROFILE_TABS: readonly ProfileTabDefinition[] = [
  { id: 'feed', label: 'Feed', path: null },
  { id: 'labels', label: 'Account labels', path: 'labels' },
  { id: 'labeled-posts', label: 'Labeled posts', path: 'labeled-posts' },
  { id: 'blocking', label: 'Blocked', path: 'blocking' },
  { id: 'blocked-by', label: 'Blocked by', path: 'blocked-by' },
  { id: 'lists', label: 'Lists', path: 'lists' },
  { id: 'listed-on', label: 'Listed on', path: 'listed-on' },
]
