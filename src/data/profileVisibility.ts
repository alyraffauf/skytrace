import { queryOptions } from '@tanstack/react-query'
import { blockTargetDid, hiddenProfileDids } from '../config/privacy'
import { CACHE_TTL_MS } from '../lib/cache'
import type { ActorProfile } from '../types'
import type { GraphDataService } from './graphData'
import type { PublicDataCore } from './publicDataCore'
import { queryKeys } from './queryKeys'

export type ProfileHiddenReason = 'explicit-hide' | 'instance-block' | 'opt-out'

export type ProfileVisibility =
  { visible: true; profile: ActorProfile } | { visible: false; reason: ProfileHiddenReason }

export class ProfileVisibilityService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly graph: GraphDataService,
  ) {}

  queryOptions(identifier: string) {
    const targetDid = blockTargetDid()
    const hiddenDids = hiddenProfileDids()
    const explicitlyHiddenDids = new Set(hiddenDids)

    return queryOptions({
      queryKey: queryKeys.profileVisibility(identifier, targetDid, hiddenDids),
      queryFn: async ({ signal }): Promise<ProfileVisibility> => {
        if (explicitlyHiddenDids.has(identifier)) return { visible: false, reason: 'explicit-hide' }

        const profile = await this.core.profile(identifier, signal)
        const did = profile.identity.did
        if (explicitlyHiddenDids.has(did)) return { visible: false, reason: 'explicit-hide' }

        if (targetDid) {
          const [actorBlocksInstance, instanceBlocksActor] = await Promise.all([
            this.graph.actorBlocksConfiguredAccount(did, targetDid, signal),
            this.graph.actorBlocksConfiguredAccount(targetDid, did, signal),
          ])
          // An instance restriction takes precedence over the account's opt-out.
          if (instanceBlocksActor) return { visible: false, reason: 'instance-block' }
          if (actorBlocksInstance) return { visible: false, reason: 'opt-out' }
        }

        return { visible: true, profile }
      },
      staleTime: CACHE_TTL_MS.activity,
    })
  }
}
