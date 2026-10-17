import { queryOptions } from '@tanstack/react-query'
import type { ActorIdentity, FeedPost, RawRecord, UnavailableItem } from '../types'
import { CACHE_TTL_MS } from '../lib/cache'
import type { ActorDataService } from './actorData'
import type { PublicDataCore } from './publicDataCore'
import { decodePostRecord } from './postParser'
import { queryKeys } from './queryKeys'
import { unavailable } from './recordResults'

export class PostDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly actors: ActorDataService,
  ) {}

  async loadFromRecord({
    record,
    repository,
    signal,
  }: {
    record: RawRecord
    repository?: ActorIdentity
    signal?: AbortSignal
  }): Promise<FeedPost | UnavailableItem> {
    const post = decodePostRecord(record)
    if (post.kind === 'unavailable') return post
    const authorDid = post.author.did
    const repositoryPds =
      repository?.did === authorDid ? repository.pds : (await this.actors.optionalIdentity(authorDid, signal))?.pds
    return { ...post, repositoryPds }
  }

  feedPostQueryOptions(uri: FeedPost['uri']) {
    return queryOptions({
      queryKey: queryKeys.feedPost(uri),
      queryFn: async ({ signal }) => {
        const record = await this.core.optionalRecord(uri, signal)
        if (!record) return unavailable(uri, 'This post could not be loaded.')
        const post = await this.loadFromRecord({ record, signal })
        return post.kind === 'post' ? post : unavailable(uri, 'This post is malformed.')
      },
      staleTime: CACHE_TTL_MS.activity,
    })
  }
}
