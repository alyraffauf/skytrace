import { AppBskyGraphBlock, AppBskyGraphList, AppBskyGraphListitem } from '@atcute/bluesky'
import { queryOptions } from '@tanstack/react-query'
import type { ActorIdentity, ListSummary, Page, RawRecord, RelationshipEntry, UnavailableItem } from '../types'
import { CACHE_TTL_MS } from '../lib/cache'
import { actorFromAtUri, isDid, parseAtUri } from '../lib/parse'
import { actorReference, isUnavailableRecord, type PublicDataCore, unavailable } from './publicDataCore'
import { queryKeys } from './queryKeys'
import { blobCid, parsedRecord } from './recordParsers'

export class GraphDataService {
  constructor(private readonly core: PublicDataCore) {}

  profileBlockedQueryOptions(did?: ActorIdentity['did'], targetDid?: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.profileBlocked(did, targetDid),
      queryFn: async ({ signal }) => {
        if (!did || !targetDid) return false
        const [actorBlocksInstance, instanceBlocksActor] = await Promise.all([
          this.actorBlocksConfiguredAccount(did, targetDid, signal),
          this.actorBlocksConfiguredAccount(targetDid, did, signal),
        ])
        if (instanceBlocksActor) return 'instance-block' as const
        if (actorBlocksInstance) return 'opt-out' as const
        return false
      },
      enabled: did !== undefined && targetDid !== undefined,
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
    const page = await this.core.backlinks({ subject: did, source: 'app.bsky.graph.block:subject', cursor, signal })
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

  async listMembers(listUri: string, cursor?: string, signal?: AbortSignal): Promise<Page<{ uri: string }>> {
    const listRecord = parseAtUri(listUri)
    if (listRecord?.collection !== 'app.bsky.graph.list') {
      throw new Error('This list address is invalid.')
    }

    return this.core.backlinks({
      subject: listUri,
      source: 'app.bsky.graph.listitem:list',
      cursor,
      signal,
    })
  }

  listMemberQueryOptions(listUri: string, membershipUri: string) {
    return queryOptions({
      queryKey: queryKeys.listMember(listUri, membershipUri),
      queryFn: async ({ signal }) => {
        const membership = await this.core.record(membershipUri, signal)
        const value = parsedRecord(AppBskyGraphListitem.mainSchema, membership)
        if (!value || value.list !== listUri || !isDid(value.subject))
          return unavailable(membershipUri, 'This list membership is malformed.')
        return {
          kind: 'relationship' as const,
          id: membershipUri,
          actor: actorReference(value.subject),
          createdAt: value.createdAt,
        }
      },
      staleTime: CACHE_TTL_MS.activity,
    })
  }

  async listedOnReferences(did: string, cursor?: string, signal?: AbortSignal): Promise<Page<{ uri: string }>> {
    return this.core.backlinks({ subject: did, source: 'app.bsky.graph.listitem:subject', cursor, signal })
  }

  listedOnMembershipQueryOptions(membershipUri: string) {
    return queryOptions({
      queryKey: queryKeys.listedOnMembership(membershipUri),
      queryFn: async ({ signal }) => {
        const membership = await this.core.record(membershipUri, signal)
        const value = parsedRecord(AppBskyGraphListitem.mainSchema, membership)
        if (!value || !parseAtUri(value.list))
          return unavailable(membershipUri, 'This membership has no valid list reference.')
        const list = this.listFromRecord(await this.core.record(value.list, signal))
        return { kind: 'membership' as const, uri: membershipUri, createdAt: value.createdAt, list }
      },
      staleTime: CACHE_TTL_MS.activity,
    })
  }
}
