import type { FeedItem } from '../../types'
import { dedupeBy } from '../collections'
import { newestFirst } from '../sorting'

export function mergeFeedItems(items: FeedItem[]): FeedItem[] {
  return newestFirst(dedupeBy(items, (item) => (item.kind === 'unavailable' ? item.id : item.uri)))
}
