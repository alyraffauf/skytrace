import type { RepositoryRecord } from '../types'

export type FeedStreamState = {
  records: RepositoryRecord[]
  cursor?: string
  done: boolean
  seenCursors: Set<string>
}

export type FeedPagingState = {
  kind: 'feed'
  did: string
  posts: FeedStreamState
  reposts: FeedStreamState
}

function emptyStream(): FeedStreamState {
  return { records: [], done: false, seenCursors: new Set() }
}

export function readFeedState(did: string, cursor?: FeedPagingState): FeedPagingState {
  if (!cursor) return { kind: 'feed', did, posts: emptyStream(), reposts: emptyStream() }
  if (cursor.did !== did) throw new Error('This feed cursor belongs to another account.')
  return {
    kind: 'feed',
    did,
    posts: { ...cursor.posts, records: [...cursor.posts.records], seenCursors: new Set(cursor.posts.seenCursors) },
    reposts: {
      ...cursor.reposts,
      records: [...cursor.reposts.records],
      seenCursors: new Set(cursor.reposts.seenCursors),
    },
  }
}

export function storeFeedState(state: FeedPagingState): FeedPagingState {
  return readFeedState(state.did, state)
}
