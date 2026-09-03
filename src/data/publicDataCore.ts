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
import { combinedSignal, deadlineSignal, throwIfAborted } from '../lib/abort'
import { CACHE_TTL_MS } from '../lib/cache'
import { queryKeys } from './queryKeys'
import { labelDefinitionsFromRecord, profileFromRecord } from './recordParsers'
import {
  getBacklinks,
  getPlcAccountDetails,
  getRecordByUri,
  listRecords,
  PublicDataValidationError,
  queryLabels,
  resolveActor,
} from './xrpc'

const OPTIONAL_PROFILE_TIMEOUT_MS = 1_500
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
  private readonly inFlight = new Map<
    string,
    {
      controller: AbortController
      promise: Promise<unknown>
      subscribers: number
      settled: boolean
    }
  >()

  constructor(
    private readonly queryClient: QueryClient,
    private readonly optionalProfileTimeoutMs = OPTIONAL_PROFILE_TIMEOUT_MS,
    private readonly requestTimeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

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

  private async loadAccountDetails(did: ActorIdentity['did'], signal?: AbortSignal): Promise<AccountDetails> {
    if (isPlcDid(did)) return getPlcAccountDetails(did, signal)
    if (!isWebDid(did)) return { aliases: [], formerHandles: [] }
    const document = await didDocumentResolver.resolve(did, { signal })
    return { aliases: [...new Set(document.alsoKnownAs ?? [])], formerHandles: [] }
  }

  async identity(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
    return this.sharedQuery(
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
    return this.sharedQuery(
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

  async profile(identifier: string, signal?: AbortSignal): Promise<ActorProfile> {
    return this.sharedQuery(
      queryKeys.profileView(identifier),
      CACHE_TTL_MS.profile,
      (requestSignal) => this.loadProfile(identifier, requestSignal),
      signal,
    )
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
    load: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T | undefined> {
    try {
      const requestSignal = deadlineSignal(signal, this.optionalProfileTimeoutMs)
      const result = await load(requestSignal)
      throwIfAborted(signal)
      return result
    } catch {
      throwIfAborted(signal)
      return undefined
    }
  }

  async repositoryRecords(options: Parameters<typeof listRecords>[0]): Promise<Page<RepositoryRecord>> {
    const key = queryKeys.repositoryRecords(options.identity, options.collection, options.cursor, options.limit)
    const page = await this.sharedQuery(
      key,
      CACHE_TTL_MS.activity,
      (signal) => listRecords({ ...options, signal }),
      options.signal,
    )
    throwIfAborted(options.signal)
    if (options.cursor && page.cursor === options.cursor)
      throw new PublicDataValidationError('The PDS repeated a pagination cursor.')
    return page
  }

  async backlinks(options: Parameters<typeof getBacklinks>[0]): Promise<Page<{ uri: string }>> {
    const key = queryKeys.backlinks(options.subject, options.source, options.cursor)
    const page = await this.sharedQuery(
      key,
      CACHE_TTL_MS.activity,
      (signal) => getBacklinks({ ...options, signal }),
      options.signal,
    )
    throwIfAborted(options.signal)
    if (options.cursor && page.cursor === options.cursor)
      throw new PublicDataValidationError('Constellation repeated a pagination cursor.')
    return page
  }

  async labelRecords(
    options: Parameters<typeof queryLabels>[0],
  ): Promise<Page<Omit<LabelEvent, 'source'> | UnavailableItem>> {
    const service = options.service ?? SERVICE_URLS.labelRelay
    const key = queryKeys.labels(
      service,
      options.uriPatterns,
      options.sources ?? [],
      options.cursor,
      options.limit ?? 50,
    )
    const page = await this.sharedQuery(
      key,
      CACHE_TTL_MS.activity,
      (signal) => queryLabels({ ...options, signal }),
      options.signal,
    )
    throwIfAborted(options.signal)
    if (options.cursor && page.cursor === options.cursor)
      throw new PublicDataValidationError('The label service repeated a pagination cursor.')
    return page
  }

  async labelerEndpoint(did: string, signal?: AbortSignal): Promise<string | undefined> {
    return this.sharedQuery(
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

  sharedQuery<T>(
    queryKey: readonly unknown[],
    staleTime: number,
    load: (signal: AbortSignal) => Promise<T>,
    consumerSignal?: AbortSignal,
  ): Promise<T> {
    throwIfAborted(consumerSignal)
    const flightKey = JSON.stringify(queryKey)
    let flight = this.inFlight.get(flightKey)
    if (flight?.controller.signal.aborted) {
      return this.waitForSettlement(flight.promise, consumerSignal).then(() =>
        this.sharedQuery(queryKey, staleTime, load, consumerSignal),
      )
    }
    if (!flight) {
      const controller = new AbortController()
      const created = { controller, subscribers: 0, settled: false, promise: Promise.resolve() as Promise<unknown> }
      created.promise = this.queryClient
        .fetchQuery({
          queryKey,
          queryFn: ({ signal }) =>
            load(deadlineSignal(combinedSignal(controller.signal, signal), this.requestTimeoutMs)),
          staleTime,
        })
        .finally(() => {
          created.settled = true
          if (this.inFlight.get(flightKey) === created) this.inFlight.delete(flightKey)
        })
      flight = created
      this.inFlight.set(flightKey, flight)
    }
    flight.subscribers += 1

    return new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = (complete: () => void) => {
        if (finished) return
        finished = true
        consumerSignal?.removeEventListener('abort', abort)
        flight!.subscribers -= 1
        if (flight!.subscribers === 0 && !flight!.settled) {
          flight!.controller.abort()
        }
        complete()
      }
      const abort = () =>
        finish(() => reject(consumerSignal?.reason ?? new DOMException('The request was aborted.', 'AbortError')))
      consumerSignal?.addEventListener('abort', abort, { once: true })
      if (consumerSignal?.aborted) return abort()
      flight!.promise.then(
        (value) => finish(() => resolve(value as T)),
        (error) => finish(() => reject(error)),
      )
    })
  }

  private waitForSettlement(promise: Promise<unknown>, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    return new Promise((resolve, reject) => {
      let finished = false
      const finish = (complete: () => void) => {
        if (finished) return
        finished = true
        signal?.removeEventListener('abort', abort)
        complete()
      }
      const abort = () =>
        finish(() => reject(signal?.reason ?? new DOMException('The request was aborted.', 'AbortError')))
      signal?.addEventListener('abort', abort, { once: true })
      promise.then(
        () => finish(resolve),
        () => finish(resolve),
      )
    })
  }
}
