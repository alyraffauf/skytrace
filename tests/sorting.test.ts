import { expect, it } from 'vitest'
import { compareLabeledPostsNewestFirst } from '../src/lib/sorting'
import type { LabeledPost } from '../src/types'

function labeledPost(key: string, createdAt: string): LabeledPost {
  return {
    kind: 'labeledPost',
    labels: [],
    post: {
      kind: 'post',
      uri: `at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/${key}`,
      author: { kind: 'actorReference', did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz' },
      text: '',
      facets: [],
      createdAt,
    },
  }
}
it('orders posts by creation time and breaks ties by URI, retaining invalid dates last', () => {
  const older = labeledPost('old', '2025-01-01T00:00:00Z')
  const first = labeledPost('a', '2026-01-01T00:00:00Z')
  const second = labeledPost('b', first.post.createdAt)
  const invalid = labeledPost('invalid', 'bad')
  const empty = labeledPost('empty', '')
  expect([invalid, second, older, empty, first].sort(compareLabeledPostsNewestFirst)).toEqual([
    first,
    second,
    older,
    empty,
    invalid,
  ])
})
