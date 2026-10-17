import { AppBskyFeedRepost } from '@atcute/bluesky'
import type { ActorIdentity, FeedItem, FeedPost, Page, RepositoryRecord } from '../types'
import { dedupeBy } from '../lib/collections'
import { timestampFor } from '../lib/sorting'
import { readFeedState, snapshotFeedState, type FeedPagingState, type FeedStreamState } from './feedPaging'
import type { PostDataService } from './postData'
import type { PublicDataCore } from './publicDataCore'
import { actorReference, isUnavailableRecord, unavailable } from './recordResults'
import { objectValue, parsedRecord } from './recordParsers'
import { PublicDataValidationError } from './validationError'

const FEED_BATCH_SIZE = 12
const MAX_EMPTY_FEED_PAGES = 4

export class FeedDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly posts: PostDataService,
  ) {}

  async feed(
    identity: ActorIdentity,
    cursor?: FeedPagingState,
    signal?: AbortSignal,
  ): Promise<Page<FeedItem, FeedPagingState>> {
    const state = readFeedState(identity.did, cursor)
    const selected: Array<{ type: 'post' | 'repost'; record: RepositoryRecord }> = []
    const emptyPageBudgets = {
      posts: { remaining: MAX_EMPTY_FEED_PAGES },
      reposts: { remaining: MAX_EMPTY_FEED_PAGES },
    }

    while (selected.length < FEED_BATCH_SIZE) {
      await Promise.all([
        this.fillFeedStream(identity, 'app.bsky.feed.post', state.posts, emptyPageBudgets.posts, signal),
        this.fillFeedStream(identity, 'app.bsky.feed.repost', state.reposts, emptyPageBudgets.reposts, signal),
      ])
      const post = state.posts.records[0]
      const repost = state.reposts.records[0]
      if (!post && !repost) break
      if (post && (!repost || rawRecordDate(post) >= rawRecordDate(repost))) {
        selected.push({ type: 'post', record: state.posts.records.shift()! })
      } else {
        selected.push({ type: 'repost', record: state.reposts.records.shift()! })
      }
    }

    const items = await Promise.all(
      selected.map(async ({ type, record }): Promise<FeedItem> => {
        if (isUnavailableRecord(record)) return record
        if (type === 'post') return this.posts.loadFromRecord({ record, repository: identity, signal })
        const value = parsedRecord(AppBskyFeedRepost.mainSchema, record)
        if (!value) return unavailable(record.uri, 'This repost record is malformed.')
        const subjectUri = value.subject.uri
        return {
          kind: 'repost',
          uri: record.uri,
          createdAt: value.createdAt,
          author: actorReference(identity.did),
          subjectUri: subjectUri as FeedPost['uri'],
        }
      }),
    )
    const hasMore =
      state.posts.records.length > 0 || state.reposts.records.length > 0 || !state.posts.done || !state.reposts.done
    return {
      items: mergeFeedItems(items),
      cursor: hasMore ? snapshotFeedState(state) : undefined,
    }
  }

  private async fillFeedStream(
    identity: ActorIdentity,
    collection: 'app.bsky.feed.post' | 'app.bsky.feed.repost',
    stream: FeedStreamState,
    emptyPageBudget: { remaining: number },
    signal?: AbortSignal,
  ): Promise<void> {
    if (stream.records.length > 0 || stream.done) return
    while (emptyPageBudget.remaining > 0) {
      const page = await this.core.repositoryRecords({ identity, collection, cursor: stream.cursor, limit: 50, signal })
      stream.records = [...page.items].sort((left, right) => rawRecordDate(right) - rawRecordDate(left))
      if (!page.cursor) {
        stream.done = true
        return
      }
      if (stream.seenCursors.has(page.cursor)) throw new PublicDataValidationError('The PDS repeated a feed cursor.')
      stream.seenCursors.add(page.cursor)
      stream.cursor = page.cursor
      if (stream.records.length > 0) return
      emptyPageBudget.remaining -= 1
    }
  }
}

function rawRecordDate(record: RepositoryRecord): number {
  if (isUnavailableRecord(record)) return Number.NEGATIVE_INFINITY
  const createdAt = objectValue(record.value)?.createdAt
  return timestampFor(typeof createdAt === 'string' ? createdAt : undefined)
}

export function mergeFeedItems(items: FeedItem[]): FeedItem[] {
  return dedupeBy(items, (item) => (item.kind === 'unavailable' ? item.id : item.uri)).sort(
    (left, right) =>
      timestampFor(right.kind === 'unavailable' ? undefined : right.createdAt) -
      timestampFor(left.kind === 'unavailable' ? undefined : left.createdAt),
  )
}
