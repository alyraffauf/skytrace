import type { QueryClient } from '@tanstack/react-query'
import type {
  ActorIdentity,
  FeedItem,
  LabeledPost,
  LabelEvent,
  ListSummary,
  Page,
  RawRecord,
  RelationshipEntry,
  UnavailableItem,
} from '../types'
import type { FeedPagingState } from './feedPaging'
import { FeedDataService, mergeFeedItems, type LabeledPostsCursor } from './feedData'
import { GraphDataService } from './graphData'
import { LabelDataService } from './labelData'
import type { LabelPagingState } from './labelPaging'
import { PublicDataCore } from './publicDataCore'

export { mergeFeedItems }
export type { LabeledPostsCursor }

export class PublicDataService {
  private readonly core: PublicDataCore
  private readonly graph: GraphDataService
  private readonly labelsService: LabelDataService
  private readonly feedService: FeedDataService

  constructor(queryClient: QueryClient, requestTimeoutMs?: number) {
    this.core = new PublicDataCore(queryClient, requestTimeoutMs)
    this.graph = new GraphDataService(this.core)
    this.labelsService = new LabelDataService(this.core)
    this.feedService = new FeedDataService(this.core, this.labelsService)
  }

  identityQueryOptions(identifier: string) {
    return this.core.identityQueryOptions(identifier)
  }

  accountDetailsQueryOptions(did: ActorIdentity['did']) {
    return this.core.accountDetailsQueryOptions(did)
  }

  identity(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
    return this.core.identity(identifier, signal)
  }

  record(uri: string, signal?: AbortSignal): Promise<RawRecord> {
    return this.core.record(uri, signal)
  }

  actorProfileQueryOptions(identifier: string) {
    return this.core.actorProfileQueryOptions(identifier)
  }

  labelDefinitionsQueryOptions(did: ActorIdentity['did']) {
    return this.core.labelDefinitionsQueryOptions(did)
  }

  blockedCountQueryOptions(identity?: ActorIdentity) {
    return this.core.blockedCountQueryOptions(identity)
  }

  blockedByCountQueryOptions(did?: ActorIdentity['did']) {
    return this.core.blockedByCountQueryOptions(did)
  }

  listBlockCountQueryOptions(listUri?: string) {
    return this.core.listBlockCountQueryOptions(listUri)
  }

  actorBlocksConfiguredAccountQueryOptions(did?: ActorIdentity['did'], targetDid?: ActorIdentity['did']) {
    return this.graph.actorBlocksConfiguredAccountQueryOptions(did, targetDid)
  }

  actorBlocksConfiguredAccount(
    did: ActorIdentity['did'],
    targetDid: ActorIdentity['did'],
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.graph.actorBlocksConfiguredAccount(did, targetDid, signal)
  }

  blocking(
    identity: ActorIdentity,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<Page<RelationshipEntry | UnavailableItem>> {
    return this.graph.blocking(identity, cursor, signal)
  }

  blockedBy(did: string, cursor?: string, signal?: AbortSignal): Promise<Page<RelationshipEntry | UnavailableItem>> {
    return this.graph.blockedBy(did, cursor, signal)
  }

  blockDateQueryOptions(blockUri: string) {
    return this.graph.blockDateQueryOptions(blockUri)
  }

  listSummaryQueryOptions(uri: string | undefined) {
    return this.graph.listSummaryQueryOptions(uri)
  }

  lists(identity: ActorIdentity, cursor?: string, signal?: AbortSignal): Promise<Page<ListSummary | UnavailableItem>> {
    return this.graph.lists(identity, cursor, signal)
  }

  listMembers(listUri: string, cursor?: string, signal?: AbortSignal): Promise<Page<{ uri: string }>> {
    return this.graph.listMembers(listUri, cursor, signal)
  }

  listMemberQueryOptions(listUri: string, membershipUri: string) {
    return this.graph.listMemberQueryOptions(listUri, membershipUri)
  }

  listedOnReferences(did: string, cursor?: string, signal?: AbortSignal): Promise<Page<{ uri: string }>> {
    return this.graph.listedOnReferences(did, cursor, signal)
  }

  listedOnMembershipQueryOptions(membershipUri: string) {
    return this.graph.listedOnMembershipQueryOptions(membershipUri)
  }

  labels(
    did: string,
    cursor?: LabelPagingState,
    signal?: AbortSignal,
  ): Promise<Page<LabelEvent | UnavailableItem, LabelPagingState>> {
    return this.labelsService.labels(did, cursor, signal)
  }

  labeledPosts(
    identity: ActorIdentity,
    cursor?: LabeledPostsCursor,
    signal?: AbortSignal,
  ): Promise<Page<LabeledPost, LabeledPostsCursor>> {
    return this.feedService.labeledPosts(identity, cursor, signal)
  }

  feed(
    identity: ActorIdentity,
    cursor?: FeedPagingState,
    signal?: AbortSignal,
  ): Promise<Page<FeedItem, FeedPagingState>> {
    return this.feedService.feed(identity, cursor, signal)
  }

  feedPostQueryOptions(uri: import('../types').FeedPost['uri']) {
    return this.feedService.feedPostQueryOptions(uri)
  }
}

const services = new WeakMap<QueryClient, PublicDataService>()

export function publicDataServiceFor(queryClient: QueryClient): PublicDataService {
  const existing = services.get(queryClient)
  if (existing) return existing
  const service = new PublicDataService(queryClient)
  services.set(queryClient, service)
  return service
}
