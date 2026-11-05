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

export function isProfileTabEnabled(id: ProfileTabId): boolean {
  return !window.__SKYTRACE_CONFIG__?.disabledTabs?.includes(id)
}

export function enabledProfileTabs() {
  return PROFILE_TABS.filter((tab) => isProfileTabEnabled(tab.id))
}
