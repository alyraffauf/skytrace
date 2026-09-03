import type { QueryClient } from '@tanstack/react-query'
import type {
  ActorIdentity,
  ActorProfile,
  FeedItem,
  LabeledPost,
  LabelEvent,
  ListMembership,
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

  constructor(queryClient: QueryClient, optionalProfileTimeoutMs?: number, requestTimeoutMs?: number) {
    this.core = new PublicDataCore(queryClient, optionalProfileTimeoutMs, requestTimeoutMs)
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

  profile(identifier: string, signal?: AbortSignal): Promise<ActorProfile> {
    return this.core.profile(identifier, signal)
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

  listSummaryQueryOptions(uri: string | undefined) {
    return this.graph.listSummaryQueryOptions(uri)
  }

  lists(identity: ActorIdentity, cursor?: string, signal?: AbortSignal): Promise<Page<ListSummary | UnavailableItem>> {
    return this.graph.lists(identity, cursor, signal)
  }

  listedOn(did: string, cursor?: string, signal?: AbortSignal): Promise<Page<ListMembership | UnavailableItem>> {
    return this.graph.listedOn(did, cursor, signal)
  }

  listMembers(
    listUri: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<Page<RelationshipEntry | UnavailableItem>> {
    return this.graph.listMembers(listUri, cursor, signal)
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
}

const services = new WeakMap<QueryClient, PublicDataService>()

export function publicDataServiceFor(queryClient: QueryClient): PublicDataService {
  const existing = services.get(queryClient)
  if (existing) return existing
  const service = new PublicDataService(queryClient)
  services.set(queryClient, service)
  return service
}
