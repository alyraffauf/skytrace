import { AppBskyFeedPost, AppBskyFeedRepost } from '@atcute/bluesky'
import type {
  ActorIdentity,
  FeedItem,
  FeedPost,
  LabeledPost,
  LabelEvent,
  Page,
  RawRecord,
  RepositoryRecord,
  UnavailableItem,
} from '../types'
import { dedupeBy } from '../lib/collections'
import { actorFromAtUri, parseAtUri } from '../lib/parse'
import { timestampFor } from '../lib/sorting'
import { readFeedState, storeFeedState, type FeedPagingState, type FeedStreamState } from './feedPaging'
import { type LabelDataService } from './labelData'
import { actorReference, isUnavailableRecord, type PublicDataCore, unavailable } from './publicDataCore'
import { blobCid, objectValue, parseFacets, parseImages, parsedRecord, stringValue } from './recordParsers'
import { PublicDataValidationError } from './xrpc'

const LABELED_POST_BATCH_SIZE = 12
const FEED_BATCH_SIZE = 12
const MAX_EMPTY_FEED_PAGES = 4

export type LabeledPostsCursor = {
  kind: 'labeledPosts'
  did: string
  repositoryCursor?: string
  seenRepositoryCursors: string[]
}

export class FeedDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly labels: LabelDataService,
  ) {}

  async labeledPosts(
    identity: ActorIdentity,
    cursor?: LabeledPostsCursor,
    signal?: AbortSignal,
  ): Promise<Page<LabeledPost, LabeledPostsCursor>> {
    if (cursor && cursor.did !== identity.did) throw new Error('This labeled-post cursor belongs to another account.')
    const postsPage = await this.core.repositoryRecords({
      identity,
      collection: 'app.bsky.feed.post',
      cursor: cursor?.repositoryCursor,
      limit: LABELED_POST_BATCH_SIZE,
      signal,
    })
    const records = postsPage.items.filter((record): record is RawRecord => !isUnavailableRecord(record))
    const labels = await this.labels.labelsForSubjects(
      records.map((record) => record.uri),
      signal,
    )
    const labelsByPost = groupLabelsByPost(labels)
    const items = await Promise.all(
      records
        .filter((record) => labelsByPost.has(record.uri))
        .map(async (record): Promise<LabeledPost> => ({
          kind: 'labeledPost',
          uri: record.uri,
          post: await this.postFromRecord({ record, repository: identity, signal }),
          labels: labelsByPost.get(record.uri)!,
        })),
    )
    items.sort((left, right) => labeledPostDate(right) - labeledPostDate(left) || left.uri.localeCompare(right.uri))
    if (!postsPage.cursor) return { items }
    const seenCursors = new Set(cursor?.seenRepositoryCursors ?? [])
    if (seenCursors.has(postsPage.cursor))
      throw new PublicDataValidationError('The PDS repeated a labeled-post cursor.')
    seenCursors.add(postsPage.cursor)
    return {
      items,
      cursor: {
        kind: 'labeledPosts',
        did: identity.did,
        repositoryCursor: postsPage.cursor,
        seenRepositoryCursors: [...seenCursors],
      },
    }
  }

  private async postFromRecord(options: {
    record: RawRecord
    repository?: ActorIdentity
    signal?: AbortSignal
    hydrateQuote?: boolean
  }): Promise<FeedPost | UnavailableItem> {
    const { record, repository, signal, hydrateQuote = true } = options
    const authorDid = actorFromAtUri(record.uri)
    const value = parsedRecord(AppBskyFeedPost.mainSchema, record)
    if (!authorDid || !value) return unavailable(record.uri, 'This post is malformed or unavailable.')
    const embed = objectValue(value.embed)
    let mediaEmbed = embed
    let quoteUri: string | undefined
    if (embed?.['$type'] === 'app.bsky.embed.recordWithMedia') {
      mediaEmbed = objectValue(embed.media)
      quoteUri = stringValue(objectValue(objectValue(embed.record)?.record)?.uri)
    } else if (embed?.['$type'] === 'app.bsky.embed.record') {
      quoteUri = stringValue(objectValue(embed.record)?.uri)
    }
    const video =
      mediaEmbed?.['$type'] === 'app.bsky.embed.video'
        ? {
            cid: blobCid(mediaEmbed.video),
            alt: stringValue(mediaEmbed.alt),
            mimeType: stringValue(objectValue(mediaEmbed.video)?.mimeType),
          }
        : undefined
    const reply = objectValue(value.reply)
    const rawReplyTo = stringValue(objectValue(reply?.parent)?.uri)
    const replyTo = rawReplyTo && parseAtUri(rawReplyTo) ? (rawReplyTo as FeedPost['uri']) : undefined
    const author = actorReference(authorDid as ActorIdentity['did'])
    const repositoryPromise =
      repository?.did === authorDid ? Promise.resolve(repository) : this.core.optionalIdentity(authorDid, signal)
    let quote: FeedPost | UnavailableItem | undefined
    if (hydrateQuote && quoteUri) {
      const quoteRecord = await this.core.optionalRecord(quoteUri, signal)
      quote = quoteRecord
        ? await this.postFromRecord({ record: quoteRecord, repository, signal, hydrateQuote: false })
        : unavailable(quoteUri, 'Quoted post unavailable.')
    }
    return {
      kind: 'post',
      uri: record.uri,
      author,
      repository: await repositoryPromise,
      createdAt: value.createdAt,
      text: value.text,
      facets: parseFacets(value.text, value.facets),
      replyTo,
      images: parseImages(mediaEmbed),
      quote,
      video: video?.cid ? { cid: video.cid, alt: video.alt, mimeType: video.mimeType } : undefined,
    }
  }

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
        if (type === 'post') return this.postFromRecord({ record, repository: identity, signal })
        const value = parsedRecord(AppBskyFeedRepost.mainSchema, record)
        if (!value) return unavailable(record.uri, 'This repost record is malformed.')
        const subjectUri = value.subject.uri
        const targetRecord = await this.core.optionalRecord(subjectUri, signal)
        const target = targetRecord
          ? await this.postFromRecord({ record: targetRecord, repository: identity, signal })
          : unavailable(subjectUri, 'Reposted post unavailable.')
        return {
          kind: 'repost',
          uri: record.uri,
          createdAt: value.createdAt,
          author: actorReference(identity.did),
          target,
        }
      }),
    )
    const hasMore =
      state.posts.records.length > 0 || state.reposts.records.length > 0 || !state.posts.done || !state.reposts.done
    return {
      items: mergeFeedItems(items),
      cursor: hasMore ? storeFeedState(state) : undefined,
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

function groupLabelsByPost(labels: LabelEvent[]): Map<string, LabelEvent[]> {
  const grouped = new Map<string, LabelEvent[]>()
  for (const label of labels) {
    const postLabels = grouped.get(label.subject) ?? []
    postLabels.push(label)
    grouped.set(label.subject, postLabels)
  }
  for (const postLabels of grouped.values())
    postLabels.sort((left, right) => timestampFor(right.createdAt) - timestampFor(left.createdAt))
  return grouped
}

function labeledPostDate(item: LabeledPost): number {
  return timestampFor(item.post.kind === 'post' ? item.post.createdAt : item.labels[0]?.createdAt)
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
