import { ClientResponseError } from '@atcute/client'
import { isPlcDid, isWebDid } from '@atcute/identity'
import { queryOptions } from '@tanstack/react-query'
import type { AccountDetails, ActorIdentity, ActorProfile } from '../../types'
import { deadlineSignal, throwIfAborted } from '../../lib/abort'
import { CACHE_TTL_MS } from '../runtime/cachePolicy'
import { didDocumentResolver } from '../api/didDocumentResolver'
import { resolveActor } from '../api/identity'
import { getPlcAccountDetails } from '../api/plcHistory'
import type { PublicDataCore } from '../publicDataCore'
import { queryKeys } from '../queryKeys'
import { profileFromRecord } from './profileParser'
import type { DataRequestContext } from '../runtime/sharedQueryRequests'
import { PublicDataValidationError } from '../validationError'

export class ActorDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly context: DataRequestContext,
  ) {}

  identityQueryOptions(identifier: string) {
    return queryOptions({
      queryKey: queryKeys.identity(identifier),
      queryFn: ({ signal }) =>
        this.resolveAndCacheIdentity(identifier, deadlineSignal(signal, this.context.requestTimeoutMs)),
      staleTime: CACHE_TTL_MS.identity,
    })
  }

  accountDetailsQueryOptions(did: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.accountDetails(did),
      queryFn: ({ signal }) => this.loadAccountDetails(did, deadlineSignal(signal, this.context.requestTimeoutMs)),
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
    return this.context.sharedRequests.query(
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
      this.context.queryClient.setQueryData(queryKeys.identity(resolved.did), resolved, { updatedAt })
    if (resolved.handle !== 'handle.invalid' && identifier !== resolved.handle) {
      this.context.queryClient.setQueryData(queryKeys.identity(resolved.handle), resolved, { updatedAt })
    }
    return resolved
  }

  actorProfileQueryOptions(identifier: string) {
    return queryOptions({
      queryKey: queryKeys.profileView(identifier),
      queryFn: ({ signal }) => this.loadProfile(identifier, signal),
      staleTime: CACHE_TTL_MS.profile,
    })
  }

  async profile(identifier: string, signal?: AbortSignal): Promise<ActorProfile> {
    return this.context.sharedRequests.query(
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
      return profileFromRecord(identity, await this.core.record(uri, signal))
    } catch (error) {
      throwIfAborted(signal)
      const canUseIdentityOnly =
        error instanceof PublicDataValidationError || (error instanceof ClientResponseError && error.status === 404)
      if (!canUseIdentityOnly) throw error
      return profileFromRecord(identity)
    }
  }

  async optionalIdentity(identifier: string, signal?: AbortSignal): Promise<ActorIdentity | undefined> {
    try {
      const result = await this.identity(identifier, signal)
      throwIfAborted(signal)
      return result
    } catch {
      throwIfAborted(signal)
      return undefined
    }
  }
}
