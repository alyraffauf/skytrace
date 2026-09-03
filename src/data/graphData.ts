import { AppBskyGraphBlock, AppBskyGraphList, AppBskyGraphListitem } from '@atcute/bluesky'
import { queryOptions } from '@tanstack/react-query'
import type {
  ActorIdentity,
  ListMembership,
  ListSummary,
  Page,
  RawRecord,
  RelationshipEntry,
  UnavailableItem,
} from '../types'
import { CACHE_TTL_MS } from '../lib/cache'
import { actorFromAtUri, isDid, parseAtUri } from '../lib/parse'
import { actorReference, isUnavailableRecord, type PublicDataCore, unavailable } from './publicDataCore'
import { queryKeys } from './queryKeys'
import { blobCid, parsedRecord } from './recordParsers'
import { throwIfAborted } from '../lib/abort'

export class GraphDataService {
  constructor(private readonly core: PublicDataCore) {}

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
    const page = await this.core.backlinks({ subject: did, source: 'app.bsky.graph.block:subject', cursor, signal })
    const items = await Promise.all(
      page.items.map(async (reference) => {
        const blockerDid = actorFromAtUri(reference.uri)
        if (!blockerDid || !isDid(blockerDid))
          return unavailable(reference.uri, 'Constellation returned an invalid block reference.')
        const relationshipRecord = await this.core.optionalRecord(reference.uri, signal)
        const createdAt = parsedRecord(AppBskyGraphBlock.mainSchema, relationshipRecord)?.createdAt
        return {
          kind: 'relationship' as const,
          id: reference.uri,
          actor: actorReference(blockerDid),
          createdAt,
        }
      }),
    )
    return { items, cursor: page.cursor }
  }

  private listFromRecord(record: RawRecord): ListSummary | UnavailableItem {
    const parts = parseAtUri(record.uri)
    const value = parsedRecord(AppBskyGraphList.mainSchema, record)
    if (!parts || !value) return unavailable(record.uri, 'This list definition is malformed or unavailable.')
    return {
      kind: 'list',
      uri: record.uri,
      name: value.name,
      description: value.description,
      purpose: value.purpose,
      avatarCid: blobCid(value.avatar),
      createdAt: value.createdAt,
      owner: actorReference(parts.did as ActorIdentity['did']),
    }
  }

  listSummaryQueryOptions(uri: string | undefined) {
    return queryOptions({
      queryKey: queryKeys.listSummary(uri),
      queryFn: ({ signal }) => {
        if (!uri) throw new Error('This list address is invalid.')
        return this.core.record(uri, signal).then((record) => this.listFromRecord(record))
      },
      staleTime: CACHE_TTL_MS.record,
    })
  }

  async lists(
    identity: ActorIdentity,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<Page<ListSummary | UnavailableItem>> {
    const page = await this.core.repositoryRecords({
      identity,
      collection: 'app.bsky.graph.list',
      cursor,
      limit: 25,
      signal,
    })
    return {
      items: page.items.map((record) => (isUnavailableRecord(record) ? record : this.listFromRecord(record))),
      cursor: page.cursor,
    }
  }

  async listedOn(did: string, cursor?: string, signal?: AbortSignal): Promise<Page<ListMembership | UnavailableItem>> {
    const page = await this.core.backlinks({ subject: did, source: 'app.bsky.graph.listitem:subject', cursor, signal })
    const items = await Promise.all(
      page.items.map(async (reference) => {
        if (!actorFromAtUri(reference.uri))
          return unavailable(reference.uri, 'Constellation returned an invalid membership reference.')
        try {
          const membership = await this.core.optionalRecord(reference.uri, signal)
          if (!membership) return unavailable(reference.uri)
          const value = parsedRecord(AppBskyGraphListitem.mainSchema, membership)
          if (!value || !parseAtUri(value.list))
            return unavailable(reference.uri, 'This membership has no valid list reference.')
          const listUri = value.list
          const listRecord = await this.core.optionalRecord(listUri, signal)
          return {
            kind: 'membership' as const,
            uri: reference.uri,
            createdAt: value.createdAt,
            list: listRecord ? this.listFromRecord(listRecord) : unavailable(listUri),
          }
        } catch {
          throwIfAborted(signal)
          return unavailable(reference.uri)
        }
      }),
    )
    return { items, cursor: page.cursor }
  }

  async listMembers(
    listUri: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<Page<RelationshipEntry | UnavailableItem>> {
    const listRecord = parseAtUri(listUri)
    if (listRecord?.collection !== 'app.bsky.graph.list') {
      return { items: [unavailable(listUri, 'This list address is invalid.')] }
    }

    const page = await this.core.backlinks({
      subject: listUri,
      source: 'app.bsky.graph.listitem:list',
      cursor,
      signal,
    })
    const items = await Promise.all(
      page.items.map(async (reference) => {
        const membership = await this.core.optionalRecord(reference.uri, signal)
        const value = parsedRecord(AppBskyGraphListitem.mainSchema, membership)
        if (!value || value.list !== listUri || !isDid(value.subject)) {
          return unavailable(reference.uri, 'This list membership is malformed or unavailable.')
        }
        return {
          kind: 'relationship' as const,
          id: reference.uri,
          actor: actorReference(value.subject),
          createdAt: value.createdAt,
        }
      }),
    )
    return { items, cursor: page.cursor }
  }
}
