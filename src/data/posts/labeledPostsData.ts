import type { ActorIdentity, LabeledPost, LabelEvent, Page, RawRecord } from '../../types'
import { newestFirst } from '../../lib/sorting'
import { compareLabeledPostsNewestFirst } from '../../lib/posts/labeledPosts'
import type { SubjectLabelsDataService } from '../labels/subjectLabelsData'
import type { PostDataService } from './postData'
import type { PublicDataCore } from '../publicDataCore'
import { isUnavailableRecord } from '../recordResults'
import { PublicDataValidationError } from '../validationError'
import { hasCursor, type CursorHistory } from '../cursorHistory'

const LABELED_POST_BATCH_SIZE = 12

export type LabeledPostsCursor = {
  kind: 'labeledPosts'
  did: string
  repositoryCursor?: string
  repositoryCursorHistory?: CursorHistory
}

export class LabeledPostsDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly posts: PostDataService,
    private readonly labels: SubjectLabelsDataService,
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
    const labels = await this.labels.forSubjects(
      records.map((record) => record.uri),
      signal,
    )
    const labelsByPost = groupLabelsByPost(labels)
    const labeledPosts = await Promise.all(
      records.map(async (record): Promise<LabeledPost | undefined> => {
        const postLabels = labelsByPost.get(record.uri)
        if (!postLabels) return undefined
        const post = await this.posts.loadFromRecord({ record, repository: identity, signal })
        if (post.kind === 'unavailable') return undefined
        return { kind: 'labeledPost', post, labels: postLabels }
      }),
    )
    const items = labeledPosts.filter((item) => item !== undefined)
    items.sort(compareLabeledPostsNewestFirst)
    if (!postsPage.cursor) return { items }
    if (hasCursor(cursor?.repositoryCursorHistory, postsPage.cursor))
      throw new PublicDataValidationError('The PDS repeated a labeled-post cursor.')
    return {
      items,
      cursor: {
        kind: 'labeledPosts',
        did: identity.did,
        repositoryCursor: postsPage.cursor,
        repositoryCursorHistory: { cursor: postsPage.cursor, previous: cursor?.repositoryCursorHistory },
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
  for (const [subject, postLabels] of grouped) grouped.set(subject, newestFirst(postLabels))
  return grouped
}
