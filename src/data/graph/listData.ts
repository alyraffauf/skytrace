import { AppBskyGraphList, AppBskyGraphListitem } from '@atcute/bluesky'
import { queryOptions } from '@tanstack/react-query'
import type { ActorIdentity, ListSummary, Page, RawRecord, UnavailableItem } from '../../types'
import { CACHE_TTL_MS } from '../runtime/cachePolicy'
import { tryParseRecordUri } from '../../lib/atproto/uri'
import type { PublicDataCore } from '../publicDataCore'
import { actorReference, isUnavailableRecord, unavailable } from '../recordResults'
import type { DataRequestContext } from '../runtime/sharedQueryRequests'
import { deadlineSignal } from '../../lib/abort'
import { getBacklinksCount } from '../api/backlinks'
import { queryKeys } from '../queryKeys'
import { parsedRecord } from '../recordValues'

const RELATIONSHIP_PAGE_SIZE = 24

export class ListDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly context: Pick<DataRequestContext, 'sharedRequests' | 'requestTimeoutMs'>,
  ) {}

  listBlockCountQueryOptions(listUri?: string) {
    return queryOptions({
      queryKey: queryKeys.listBlockCount(listUri),
      queryFn: ({ signal }) =>
        listUri
          ? getBacklinksCount({
              subject: listUri,
              source: 'app.bsky.graph.listblock:subject',
              signal: deadlineSignal(signal, this.context.requestTimeoutMs),
            })
          : Promise.resolve(undefined),
      enabled: listUri !== undefined,
      staleTime: CACHE_TTL_MS.activity,
    })
  }

  async listBlockCount(listUri: string, signal?: AbortSignal): Promise<number> {
    return this.context.sharedRequests.query(
      queryKeys.listBlockCount(listUri),
      CACHE_TTL_MS.activity,
      (requestSignal) =>
        getBacklinksCount({ subject: listUri, source: 'app.bsky.graph.listblock:subject', signal: requestSignal }),
      signal,
    )
  }

  private listFromRecord(record: RawRecord): ListSummary | UnavailableItem {
    const parts = tryParseRecordUri(record.uri)
    const value = parsedRecord(AppBskyGraphList.mainSchema, record)
    if (!parts || !value) return unavailable(record.uri, 'This list definition is malformed or unavailable.')
    return {
      kind: 'list',
      uri: record.uri,
      name: value.name,
      description: value.description,
      purpose: value.purpose,
      avatarCid: value.avatar?.ref.$link,
      createdAt: value.createdAt,
      owner: actorReference(parts.repo),
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
    const listRecord = tryParseRecordUri(listUri)
    if (listRecord?.collection !== 'app.bsky.graph.list') {
      throw new Error('This list address is invalid.')
    }

    return this.core.backlinks({
      subject: listUri,
      source: 'app.bsky.graph.listitem:list',
      limit: RELATIONSHIP_PAGE_SIZE,
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
        if (!value || value.list !== listUri) return unavailable(membershipUri, 'This list membership is malformed.')
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
    return this.core.backlinks({
      subject: did,
      source: 'app.bsky.graph.listitem:subject',
      limit: RELATIONSHIP_PAGE_SIZE,
      cursor,
      signal,
    })
  }

  listedOnMembershipQueryOptions(membershipUri: string, subjectDid: ActorIdentity['did'], minimumBlocking?: number) {
    return queryOptions({
      queryKey: queryKeys.listedOnMembership(membershipUri, subjectDid, minimumBlocking),
      queryFn: async ({ signal }) => {
        const membership = await this.core.record(membershipUri, signal)
        const value = parsedRecord(AppBskyGraphListitem.mainSchema, membership)
        if (!value || value.subject !== subjectDid)
          return unavailable(membershipUri, 'This list membership is malformed.')
        if (tryParseRecordUri(value.list)?.collection !== 'app.bsky.graph.list')
          return unavailable(membershipUri, 'This membership has no valid list reference.')
        const list = this.listFromRecord(await this.core.record(value.list, signal))
        if (minimumBlocking !== undefined && list.kind === 'list' && list.purpose === 'app.bsky.graph.defs#modlist') {
          const count = await this.listBlockCount(list.uri, signal)
          if (count < minimumBlocking) return null
        }
        return { kind: 'membership' as const, uri: membershipUri, createdAt: value.createdAt, list }
      },
      staleTime: CACHE_TTL_MS.activity,
    })
  }
}
