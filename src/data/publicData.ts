import { PostDataService } from './postData'
import { LabeledPostsDataService } from './labeledPostsData'
import { ActorDataService } from './actorData'
import { SharedQueryRequests } from './sharedQueryRequests'
import type { QueryClient } from '@tanstack/react-query'
import { FeedDataService } from './feedData'
import { GraphDataService } from './graphData'
import { LabelDataService } from './labelData'
import { PublicDataCore } from './publicDataCore'
import { ProfileVisibilityService } from './profileVisibility'

export class PublicDataService {
  readonly posts: PostDataService
  readonly labeledPosts: LabeledPostsDataService
  readonly actors: ActorDataService
  readonly core: PublicDataCore
  readonly graph: GraphDataService
  readonly labels: LabelDataService
  readonly feed: FeedDataService
  readonly profileVisibility: ProfileVisibilityService

  constructor(queryClient: QueryClient, requestTimeoutMs = 15_000) {
    const sharedRequests = new SharedQueryRequests(queryClient, requestTimeoutMs)
    const context = { queryClient, sharedRequests, requestTimeoutMs }
    this.core = new PublicDataCore(sharedRequests)
    this.actors = new ActorDataService(this.core, context)
    this.graph = new GraphDataService(this.core, context)
    this.profileVisibility = new ProfileVisibilityService(this.actors, this.graph)
    this.labels = new LabelDataService(this.core, sharedRequests)
    this.posts = new PostDataService(this.core, this.actors)
    this.feed = new FeedDataService(this.core, this.posts)
    this.labeledPosts = new LabeledPostsDataService(this.core, this.posts, this.labels)
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
