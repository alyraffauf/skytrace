export const PROFILE_TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'labels', label: 'Account labels' },
  { id: 'labeled-posts', label: 'Labeled posts' },
  { id: 'blocking', label: 'Blocked' },
  { id: 'blocked-by', label: 'Blocked by' },
  { id: 'lists', label: 'Lists' },
  { id: 'listed-on', label: 'Listed on' },
] as const

export type ProfileTabId = (typeof PROFILE_TABS)[number]['id']
export type ProfileTabSlug = Exclude<ProfileTabId, 'feed'>

export function enabledProfileTabs() {
  const disabled = window.__SKYTRACE_CONFIG__?.disabledTabs ?? []
  return PROFILE_TABS.filter((tab) => !disabled.includes(tab.id))
}
