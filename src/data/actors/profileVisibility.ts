import { queryOptions } from '@tanstack/react-query'
import { blockTargetDid, hiddenProfileDids } from '../../config/privacy'
import { CACHE_TTL_MS } from '../runtime/cachePolicy'
import type { ActorProfile } from '../../types'
import type { BlockDataService } from '../graph/blockData'
import type { ActorDataService } from './actorData'
import { queryKeys } from '../queryKeys'

export type ProfileHiddenReason = 'explicit-hide' | 'instance-block' | 'opt-out'

type ProfileVisibility = { visible: true; profile: ActorProfile } | { visible: false; reason: ProfileHiddenReason }

export class ProfileVisibilityService {
  constructor(
    private readonly actors: ActorDataService,
    private readonly blocks: BlockDataService,
  ) {}

  queryOptions(identifier: string) {
    const targetDid = blockTargetDid()
    const hiddenDids = hiddenProfileDids()
    const explicitlyHiddenDids = new Set(hiddenDids)

    return queryOptions({
      queryKey: queryKeys.profileVisibility(identifier, targetDid, hiddenDids),
      queryFn: async ({ signal }): Promise<ProfileVisibility> => {
        if (explicitlyHiddenDids.has(identifier)) return { visible: false, reason: 'explicit-hide' }

        const profile = await this.actors.profile(identifier, signal)
        const did = profile.identity.did
        if (explicitlyHiddenDids.has(did)) return { visible: false, reason: 'explicit-hide' }

        if (targetDid) {
          const [actorBlocksInstance, instanceBlocksActor] = await Promise.all([
            this.blocks.actorBlocksActor({ blockerDid: did, subjectDid: targetDid }, signal),
            this.blocks.actorBlocksActor({ blockerDid: targetDid, subjectDid: did }, signal),
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
