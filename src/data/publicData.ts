import type { QueryClient } from '@tanstack/react-query'
import { FeedDataService } from './feedData'
import { GraphDataService } from './graphData'
import { LabelDataService } from './labelData'
import { PublicDataCore } from './publicDataCore'

export class PublicDataService {
  readonly core: PublicDataCore
  readonly graph: GraphDataService
  readonly labels: LabelDataService
  readonly feed: FeedDataService

  constructor(queryClient: QueryClient, requestTimeoutMs?: number) {
    this.core = new PublicDataCore(queryClient, requestTimeoutMs)
    this.graph = new GraphDataService(this.core)
    this.labels = new LabelDataService(this.core)
    this.feed = new FeedDataService(this.core, this.labels)
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
