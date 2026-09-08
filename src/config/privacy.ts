import type { ActorProfile } from '../types'
import { isDid } from '../lib/parse'

export function shouldHideProfilePosts(profile: ActorProfile): boolean {
  return profile.hasNoUnauthenticatedSelfLabel && window.__SKYTRACE_CONFIG__?.ignoreNoUnauthenticated !== true
}

export function blockTargetDid() {
  const configuredDid = window.__SKYTRACE_CONFIG__?.blockTargetDid
  return configuredDid && isDid(configuredDid) ? configuredDid : undefined
}
