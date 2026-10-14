import type { ActorProfile } from '../types'
import { isDid } from '../lib/parse'

export function shouldHideProfilePosts(profile: ActorProfile): boolean {
  return profile.hasNoUnauthenticatedSelfLabel && window.__SKYTRACE_CONFIG__?.ignoreNoUnauthenticated !== true
}

export function blockTargetDid() {
  const configuredDid = window.__SKYTRACE_CONFIG__?.blockTargetDid
  return configuredDid && isDid(configuredDid) ? configuredDid : undefined
}

export function hiddenProfileDids(): string[] {
  const hiddenDids = window.__SKYTRACE_CONFIG__?.hiddenDids
  if (!Array.isArray(hiddenDids)) return []
  return [...new Set(hiddenDids.filter((did) => typeof did === 'string' && isDid(did)))].sort()
}
