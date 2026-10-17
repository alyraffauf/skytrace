// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mergeFeedItems } from '../src/lib/posts/feed'
import { mergeLabeledPosts } from '../src/lib/posts/labeledPosts'
import type { FeedPost, LabeledPost, LabelEvent } from '../src/types'
import { did, actorReference } from './actorFixtures'

describe('feed merging', () => {
  const post = (uri: FeedPost['uri'], createdAt: string, extra: Partial<FeedPost> = {}): FeedPost => ({
    kind: 'post',
    uri,
    author: actorReference,
    createdAt,
    text: 'hello',
    facets: [],
    ...extra,
  })

  it('deduplicates and sorts all activity chronologically', () => {
    const older = post(`at://${did}/app.bsky.feed.post/old`, '2026-01-01T00:00:00Z')
    const newer = post(`at://${did}/app.bsky.feed.post/new`, '2026-02-01T00:00:00Z')
    expect(
      mergeFeedItems([older, newer, older]).map((item) => (item.kind === 'unavailable' ? item.id : item.uri)),
    ).toEqual([newer.uri, older.uri])
  })
})

it('merges labels from duplicate posts in newest-first order', () => {
  const post: FeedPost = {
    kind: 'post',
    uri: `at://${did}/app.bsky.feed.post/labeled-merge`,
    author: actorReference,
    createdAt: '2026-04-01T00:00:00Z',
    text: 'A labeled post',
    facets: [],
  }
  const olderLabel: LabelEvent = {
    kind: 'labelEvent',
    id: 'older-label',
    sourceDid: did,
    subject: post.uri,
    value: 'old',
    createdAt: '2026-04-02T00:00:00Z',
    negated: false,
  }
  const newerLabel: LabelEvent = { ...olderLabel, id: 'newer-label', value: 'new', createdAt: '2026-04-03T00:00:00Z' }
  const items: LabeledPost[] = [
    { kind: 'labeledPost', post: { ...post, uri: `${post.uri}-z` }, labels: [] },
    {
      kind: 'labeledPost',
      post: { ...post, uri: `${post.uri}-older`, createdAt: '2025-01-01T00:00:00Z' },
      labels: [],
    },
    { kind: 'labeledPost', post, labels: [olderLabel] },
    { kind: 'labeledPost', post, labels: [olderLabel, newerLabel] },
  ]

  expect(mergeLabeledPosts(items)).toEqual([
    expect.objectContaining({ post, labels: [newerLabel, olderLabel] }),
    items[0],
    items[1],
  ])
})
