import { queryOptions } from '@tanstack/react-query'
import { getLabelerEndpoint, isPlcDid, isWebDid } from '@atcute/identity'
import type { ActorIdentity, LabelValueDefinition } from '../../types'
import type { PublicDataCore } from '../publicDataCore'
import type { SharedQueryRequests } from '../runtime/sharedQueryRequests'
import { CACHE_TTL_MS } from '../runtime/cachePolicy'
import { didDocumentResolver } from '../api/didDocumentResolver'
import { queryKeys } from '../queryKeys'
import { labelDefinitionsFromRecord } from './definitionsParser'

export class LabelerDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly sharedRequests: SharedQueryRequests,
  ) {}

  definitionsQueryOptions(did: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.labelDefinitions(did),
      queryFn: async ({ signal }): Promise<LabelValueDefinition[]> => {
        const uri = `at://${did}/app.bsky.labeler.service/self`
        return labelDefinitionsFromRecord(await this.core.record(uri, signal))
      },
      staleTime: CACHE_TTL_MS.identity,
    })
  }

  async endpoint(did: string, signal?: AbortSignal): Promise<string | undefined> {
    return this.sharedRequests.query({
      queryKey: queryKeys.labelerEndpoint(did),
      staleTime: CACHE_TTL_MS.identity,
      load: async (requestSignal) => {
        if (!isPlcDid(did) && !isWebDid(did)) return undefined
        const document = await didDocumentResolver.resolve(did, { signal: requestSignal })
        const rawEndpoint = getLabelerEndpoint(document)
        if (!rawEndpoint) return undefined
        const url = new URL(rawEndpoint)
        return url.protocol === 'https:' ? url.origin : undefined
      },
      consumerSignal: signal,
    })
  }
}
