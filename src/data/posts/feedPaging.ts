import type { RepositoryRecord } from '../../types'
import type { CursorHistory } from '../cursorHistory'

export type FeedStreamState = {
  records: RepositoryRecord[]
  cursor?: string
  done: boolean
  cursorHistory?: CursorHistory
}

export type FeedPagingState = {
  kind: 'feed'
  did: string
  posts: FeedStreamState
  reposts: FeedStreamState
}

function emptyStream(): FeedStreamState {
  return { records: [], done: false }
}

export function readFeedState(did: string, cursor?: FeedPagingState): FeedPagingState {
  if (!cursor) return { kind: 'feed', did, posts: emptyStream(), reposts: emptyStream() }
  if (cursor.did !== did) throw new Error('This feed cursor belongs to another account.')
  return {
    kind: 'feed',
    did,
    posts: { ...cursor.posts, records: [...cursor.posts.records] },
    reposts: {
      ...cursor.reposts,
      records: [...cursor.reposts.records],
    },
  }
}
