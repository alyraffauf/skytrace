import { AppBskyGraphBlock } from '@atcute/bluesky'
import { queryOptions } from '@tanstack/react-query'
import type { ActorIdentity, Page, RelationshipEntry, UnavailableItem } from '../../types'
import { CACHE_TTL_MS } from '../runtime/cachePolicy'
import { actorFromAtUri } from '../../lib/atproto/uri'
import { isDid } from '@atcute/lexicons/syntax'
import type { PublicDataCore } from '../publicDataCore'
import { actorReference, isUnavailableRecord, unavailable } from '../recordResults'
import type { DataRequestContext } from '../runtime/sharedQueryRequests'
import { deadlineSignal } from '../../lib/abort'
import { countRecords } from '../api/repository'
import { getBacklinksCount } from '../api/backlinks'
import { queryKeys } from '../queryKeys'
import { parsedRecord } from '../recordValues'

const RELATIONSHIP_PAGE_SIZE = 24

export class BlockDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly context: Pick<DataRequestContext, 'requestTimeoutMs'>,
  ) {}

  blockedCountQueryOptions(identity?: ActorIdentity) {
    return queryOptions({
      queryKey: queryKeys.blockedCount(identity),
      queryFn: ({ signal }) =>
        identity
          ? countRecords({
              identity,
              collection: 'app.bsky.graph.block',
              signal,
              requestTimeoutMs: this.context.requestTimeoutMs,
            })
          : Promise.resolve(undefined),
      enabled: identity !== undefined,
      staleTime: CACHE_TTL_MS.activity,
    })
  }

  blockedByCountQueryOptions(did?: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.blockedByCount(did),
      queryFn: ({ signal }) =>
        did
          ? getBacklinksCount({
              subject: did,
              source: 'app.bsky.graph.block:subject',
              signal: deadlineSignal(signal, this.context.requestTimeoutMs),
            })
          : Promise.resolve(undefined),
      enabled: did !== undefined,
      staleTime: CACHE_TTL_MS.activity,
    })
  }

  async actorBlocksConfiguredAccount(
    did: ActorIdentity['did'],
    targetDid: ActorIdentity['did'],
    signal?: AbortSignal,
  ): Promise<boolean> {
    const page = await this.core.backlinks({
      subject: targetDid,
      source: 'app.bsky.graph.block:subject',
      did,
      signal,
    })
    return page.items.some((reference) => actorFromAtUri(reference.uri) === did)
  }

  async blocking(
    identity: ActorIdentity,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<Page<RelationshipEntry | UnavailableItem>> {
    const page = await this.core.repositoryRecords({
      identity,
      collection: 'app.bsky.graph.block',
      cursor,
      limit: 25,
      signal,
    })
    const items = page.items.map((record) => {
      if (isUnavailableRecord(record)) return record
      const block = parsedRecord(AppBskyGraphBlock.mainSchema, record)
      if (!block) return unavailable(record.uri, 'This block record is malformed.')
      return {
        kind: 'relationship' as const,
        id: record.uri,
        actor: actorReference(block.subject),
        createdAt: block.createdAt,
      }
    })
    return { items, cursor: page.cursor }
  }

  async blockedBy(
    did: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<Page<RelationshipEntry | UnavailableItem>> {
    const page = await this.core.backlinks({
      subject: did,
      source: 'app.bsky.graph.block:subject',
      limit: RELATIONSHIP_PAGE_SIZE,
      cursor,
      signal,
    })
    const items = page.items.map((reference) => {
      const blockerDid = actorFromAtUri(reference.uri)
      if (!blockerDid || !isDid(blockerDid))
        return unavailable(reference.uri, 'Constellation returned an invalid block reference.')
      return {
        kind: 'relationship' as const,
        id: reference.uri,
        actor: actorReference(blockerDid),
      }
    })
    return { items, cursor: page.cursor }
  }

  blockedByRecordQueryOptions(entry: RelationshipEntry | undefined, subjectDid: string) {
    return queryOptions({
      queryKey: queryKeys.blockedByRecord(entry?.id, subjectDid),
      queryFn: async ({ signal }) => {
        if (!entry) throw new Error('This block reference is unavailable.')
        const record = await this.core.record(entry.id, signal)
        const value = parsedRecord(AppBskyGraphBlock.mainSchema, record)
        if (!value || value.subject !== subjectDid) return unavailable(entry.id, 'This block record is malformed.')
        return { ...entry, createdAt: value.createdAt }
      },
      enabled: entry !== undefined,
      staleTime: CACHE_TTL_MS.activity,
    })
  }
}
