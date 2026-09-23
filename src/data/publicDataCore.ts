import { SharedQueryRequests } from './sharedQueryRequests'
import { ClientResponseError } from '@atcute/client'
import { getLabelerEndpoint, isPlcDid, isWebDid } from '@atcute/identity'
import { CompositeDidDocumentResolver, PlcDidDocumentResolver, WebDidDocumentResolver } from '@atcute/identity-resolver'
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type {
  AccountDetails,
  ActorIdentity,
  ActorProfile,
  ActorReference,
  LabelEvent,
  LabelValueDefinition,
  Page,
  RawRecord,
  RepositoryRecord,
  UnavailableItem,
} from '../types'
import { SERVICE_URLS } from '../config/serviceUrls'
import { deadlineSignal, throwIfAborted } from '../lib/abort'
import { CACHE_TTL_MS } from '../lib/cache'
import { queryKeys } from './queryKeys'
import { labelDefinitionsFromRecord, profileFromRecord } from './recordParsers'
import {
  countRecords,
  getBacklinks,
  getBacklinksCount,
  getPlcAccountDetails,
  getRecordByUri,
  listRecords,
  PublicDataValidationError,
  queryLabels,
  resolveActor,
} from './xrpc'

const REQUEST_TIMEOUT_MS = 15_000

const didDocumentResolver = new CompositeDidDocumentResolver({
  methods: {
    plc: new PlcDidDocumentResolver({
      apiUrl: SERVICE_URLS.plcDirectory,
      fetch: (input, init) => fetch(input, init),
    }),
    web: new WebDidDocumentResolver({ fetch: (input, init) => fetch(input, init) }),
  },
})

export function unavailable(id: string, reason = 'This public record is no longer available.'): UnavailableItem {
  return { kind: 'unavailable', id, reason }
}

export function actorReference(did: ActorIdentity['did']): ActorReference {
  return { kind: 'actorReference', did }
}

export function isUnavailableRecord(record: RepositoryRecord): record is UnavailableItem {
  return 'kind' in record && record.kind === 'unavailable'
}

export class PublicDataCore {
  private readonly sharedRequests: SharedQueryRequests

  constructor(
    private readonly queryClient: QueryClient,
    private readonly requestTimeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    this.sharedRequests = new SharedQueryRequests(queryClient, requestTimeoutMs)
  }

  identityQueryOptions(identifier: string) {
    return queryOptions({
      queryKey: queryKeys.identity(identifier),
      queryFn: ({ signal }) => this.resolveAndCacheIdentity(identifier, deadlineSignal(signal, this.requestTimeoutMs)),
      staleTime: CACHE_TTL_MS.identity,
    })
  }

  accountDetailsQueryOptions(did: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.accountDetails(did),
      queryFn: ({ signal }) => this.loadAccountDetails(did, deadlineSignal(signal, this.requestTimeoutMs)),
      staleTime: CACHE_TTL_MS.identity,
    })
  }

  blockedCountQueryOptions(identity?: ActorIdentity) {
    return queryOptions({
      queryKey: queryKeys.blockedCount(identity),
      queryFn: ({ signal }) =>
        identity
          ? countRecords({
              identity,
              collection: 'app.bsky.graph.block',
              signal,
              requestTimeoutMs: this.requestTimeoutMs,
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
              signal: deadlineSignal(signal, this.requestTimeoutMs),
            })
          : Promise.resolve(undefined),
      enabled: did !== undefined,
      staleTime: CACHE_TTL_MS.activity,
    })
  }

  listBlockCountQueryOptions(listUri?: string) {
    return queryOptions({
      queryKey: queryKeys.listBlockCount(listUri),
      queryFn: ({ signal }) =>
        listUri
          ? getBacklinksCount({
              subject: listUri,
              source: 'app.bsky.graph.listblock:subject',
              signal: deadlineSignal(signal, this.requestTimeoutMs),
            })
          : Promise.resolve(undefined),
      enabled: listUri !== undefined,
      staleTime: CACHE_TTL_MS.activity,
    })
  }

  private async loadAccountDetails(did: ActorIdentity['did'], signal?: AbortSignal): Promise<AccountDetails> {
    if (isPlcDid(did)) return getPlcAccountDetails(did, signal)
    if (!isWebDid(did)) return { aliases: [], formerHandles: [] }
    const document = await didDocumentResolver.resolve(did, { signal })
    return { aliases: [...new Set(document.alsoKnownAs ?? [])], formerHandles: [] }
  }

  async identity(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
    return this.sharedRequests.query(
      queryKeys.identity(identifier),
      CACHE_TTL_MS.identity,
      (requestSignal) => this.resolveAndCacheIdentity(identifier, requestSignal),
      signal,
    )
  }

  private async resolveAndCacheIdentity(identifier: string, signal: AbortSignal): Promise<ActorIdentity> {
    const resolved = await resolveActor(identifier, signal)
    const updatedAt = Date.now()
    if (identifier !== resolved.did)
      this.queryClient.setQueryData(queryKeys.identity(resolved.did), resolved, { updatedAt })
    if (resolved.handle !== 'handle.invalid' && identifier !== resolved.handle) {
      this.queryClient.setQueryData(queryKeys.identity(resolved.handle), resolved, { updatedAt })
    }
    return resolved
  }

  async record(uri: string, signal?: AbortSignal): Promise<RawRecord> {
    return this.sharedRequests.query(
      queryKeys.record(uri),
      CACHE_TTL_MS.record,
      (requestSignal) => getRecordByUri(uri, requestSignal),
      signal,
    )
  }

  actorProfileQueryOptions(identifier: string) {
    return queryOptions({
      queryKey: queryKeys.profileView(identifier),
      queryFn: ({ signal }) => this.loadProfile(identifier, signal),
      staleTime: CACHE_TTL_MS.profile,
    })
  }

  labelDefinitionsQueryOptions(did: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.labelDefinitions(did),
      queryFn: async ({ signal }): Promise<LabelValueDefinition[]> => {
        const uri = `at://${did}/app.bsky.labeler.service/self`
        return labelDefinitionsFromRecord(await this.record(uri, signal))
      },
      staleTime: CACHE_TTL_MS.identity,
    })
  }

  private async loadProfile(identifier: string, signal?: AbortSignal): Promise<ActorProfile> {
    const identity = await this.identity(identifier, signal)
    const uri = `at://${identity.did}/app.bsky.actor.profile/self`
    try {
      return profileFromRecord(identity, await this.record(uri, signal))
    } catch (error) {
      throwIfAborted(signal)
      const canUseIdentityOnly =
        error instanceof PublicDataValidationError || (error instanceof ClientResponseError && error.status === 404)
      if (!canUseIdentityOnly) throw error
      return profileFromRecord(identity)
    }
  }

  async optionalRecord(uri: string, signal?: AbortSignal): Promise<RawRecord | undefined> {
    return this.optionalLoad((requestSignal) => this.record(uri, requestSignal), signal)
  }

  async optionalIdentity(identifier: string, signal?: AbortSignal): Promise<ActorIdentity | undefined> {
    return this.optionalLoad((requestSignal) => this.identity(identifier, requestSignal), signal)
  }

  private async optionalLoad<T>(
    load: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T | undefined> {
    try {
      const result = await load(signal)
      throwIfAborted(signal)
      return result
    } catch {
      throwIfAborted(signal)
      return undefined
    }
  }

  async repositoryRecords(options: Parameters<typeof listRecords>[0]): Promise<Page<RepositoryRecord>> {
    return this.cachedPage({
      key: queryKeys.repositoryRecords(options.identity, options.collection, options.cursor, options.limit),
      cursor: options.cursor,
      signal: options.signal,
      load: (signal) => listRecords({ ...options, signal }),
      repeatedCursorError: 'The PDS repeated a pagination cursor.',
    })
  }

  async backlinks(options: Parameters<typeof getBacklinks>[0]): Promise<Page<{ uri: string }>> {
    return this.cachedPage({
      key: queryKeys.backlinks(options.subject, options.source, options.cursor, options.limit, options.did),
      cursor: options.cursor,
      signal: options.signal,
      load: (signal) => getBacklinks({ ...options, signal }),
      repeatedCursorError: 'Constellation repeated a pagination cursor.',
    })
  }

  async labelRecords(
    options: Parameters<typeof queryLabels>[0] & { repeatedCursorPolicy?: 'return-page' },
  ): Promise<Page<Omit<LabelEvent, 'source'> | UnavailableItem>> {
    const service = options.service ?? SERVICE_URLS.labelRelay
    const key = queryKeys.labels(
      service,
      options.uriPatterns,
      options.sources ?? [],
      options.cursor,
      options.limit ?? 50,
    )
    return this.cachedPage({
      key,
      cursor: options.cursor,
      signal: options.signal,
      load: (signal) => queryLabels({ ...options, signal }),
      repeatedCursorError: 'The label service repeated a pagination cursor.',
      repeatedCursorPolicy: options.repeatedCursorPolicy,
    })
  }

  private async cachedPage<T>(options: {
    key: readonly unknown[]
    cursor?: string
    signal?: AbortSignal
    load: (signal: AbortSignal) => Promise<Page<T>>
    repeatedCursorPolicy?: 'return-page'
    repeatedCursorError: string
  }): Promise<Page<T>> {
    const page = await this.sharedRequests.query(options.key, CACHE_TTL_MS.activity, options.load, options.signal)
    throwIfAborted(options.signal)
    if (options.repeatedCursorPolicy !== 'return-page' && options.cursor && page.cursor === options.cursor) {
      throw new PublicDataValidationError(options.repeatedCursorError)
    }
    return page
  }

  async labelerEndpoint(did: string, signal?: AbortSignal): Promise<string | undefined> {
    return this.sharedRequests.query(
      queryKeys.labelerEndpoint(did),
      CACHE_TTL_MS.identity,
      async (requestSignal) => {
        if (!isPlcDid(did) && !isWebDid(did)) return undefined
        const document = await didDocumentResolver.resolve(did, { signal: requestSignal })
        const rawEndpoint = getLabelerEndpoint(document)
        if (!rawEndpoint) return undefined
        const url = new URL(rawEndpoint)
        return url.protocol === 'https:' ? url.origin : undefined
      },
      signal,
    )
  }
}
