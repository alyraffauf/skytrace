import { useMatches, type UIMatch } from 'react-router-dom'
import type { PROFILE_TABS } from './profileTabs'

export type RouteHandle = {
  presentation?: 'home' | 'explorer'
  profileTab?: (typeof PROFILE_TABS)[number]
}

export function useRouteMetadata() {
  const matches = useMatches() as UIMatch<unknown, RouteHandle | undefined>[]
  let metadata: RouteHandle = {}
  for (const { handle } of matches) {
    if (handle) metadata = { ...metadata, ...handle }
  }
  return metadata
}
