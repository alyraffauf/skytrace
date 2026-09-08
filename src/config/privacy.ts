import type { ActorProfile } from '../types'

export function shouldHideProfilePosts(profile: ActorProfile): boolean {
  return profile.hasNoUnauthenticatedSelfLabel && window.__SKYTRACE_CONFIG__?.ignoreNoUnauthenticated !== true
}
