import type { ActorIdentity, FeedPost, LabeledPost, LabelEvent, Page, RawRecord } from '../../types'
import { compareLabeledPostsNewestFirst, timestampFor } from '../../lib/sorting'
import type { LabelDataService } from '../labels/labelData'
import type { PostDataService } from './postData'
import type { PublicDataCore } from '../publicDataCore'
import { isUnavailableRecord } from '../recordResults'
import { PublicDataValidationError } from '../validationError'

const LABELED_POST_BATCH_SIZE = 12

export type LabeledPostsCursor = {
  kind: 'labeledPosts'
  did: string
  repositoryCursor?: string
  seenRepositoryCursors: string[]
}

export class LabeledPostsDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly posts: PostDataService,
    private readonly labels: LabelDataService,
  ) {}

  async page(
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
    const parsedItems = await Promise.all(
      records
        .filter((record) => labelsByPost.has(record.uri))
        .map(async (record) => ({
          post: await this.posts.loadFromRecord({ record, repository: identity, signal }),
          labels: labelsByPost.get(record.uri)!,
        })),
    )
    const items: LabeledPost[] = parsedItems
      .filter((item): item is { post: FeedPost; labels: LabelEvent[] } => item.post.kind === 'post')
      .map((item) => ({ kind: 'labeledPost', ...item }))
    items.sort(compareLabeledPostsNewestFirst)
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
