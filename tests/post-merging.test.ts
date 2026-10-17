// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { mergeFeedItems } from '../src/lib/posts/feed'
import { mergeLabeledPosts } from '../src/lib/posts/labeledPosts'
import type { FeedPost, LabeledPost, LabelEvent } from '../src/types'
import { did, actorReference } from './actorFixtures'

const labeledPost: FeedPost = {
  kind: 'post',
  uri: `at://${did}/app.bsky.feed.post/merge`,
  author: actorReference,
  createdAt: '2026-01-01T00:00:00Z',
  text: 'First post',
  facets: [],
}

function label(id: string, extra: Partial<LabelEvent> = {}): LabelEvent {
  return {
    kind: 'labelEvent',
    id,
    sourceDid: did,
    subject: labeledPost.uri,
    value: id,
    createdAt: '2026-01-01T00:00:00Z',
    negated: false,
    ...extra,
  }
}

it('keeps the original item when duplicate posts add no labels', () => {
  const first: LabeledPost = { kind: 'labeledPost', post: labeledPost, labels: [label('original')] }
  const duplicate: LabeledPost = {
    kind: 'labeledPost',
    post: { ...labeledPost, text: 'Later copy' },
    labels: [label('original', { expiresAt: '2027-01-01T00:00:00Z' })],
  }
  expect(mergeLabeledPosts([first, duplicate])[0]).toBe(first)
})

it('applies replacements only with new labels and preserves ties across duplicate batches', () => {
  const original = label('original')
  const added = label('added')
  const replaced = label('original', { expiresAt: '2027-01-01T00:00:00Z' })
  const items: LabeledPost[] = [
    { kind: 'labeledPost', post: labeledPost, labels: [original] },
    { kind: 'labeledPost', post: { ...labeledPost, text: 'Later copy' }, labels: [replaced, added] },
    { kind: 'labeledPost', post: labeledPost, labels: [original] },
    { kind: 'labeledPost', post: labeledPost, labels: [label('last')] },
  ]
  expect(mergeLabeledPosts(items)).toEqual([
    { kind: 'labeledPost', post: labeledPost, labels: [replaced, added, label('last')] },
  ])
})

it('parses dates only linearly when duplicate posts each add a label', () => {
  const count = 1_000
  const items: LabeledPost[] = Array.from({ length: count }, (_, index) => ({
    kind: 'labeledPost',
    post: labeledPost,
    labels: [label(String(index))],
  }))
  const parseDate = vi.spyOn(Date, 'parse')
  const merged = mergeLabeledPosts(items)
  expect(merged[0]?.labels).toHaveLength(count)
  expect(merged[0]?.labels[0]?.id).toBe('0')
  expect(merged[0]?.labels.at(-1)?.id).toBe('999')
  expect(parseDate.mock.calls.length).toBeLessThanOrEqual(count * 2)
})

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
    const unavailable = { kind: 'unavailable' as const, id: 'missing', reason: 'Deleted' }
    const duplicate = { ...older, text: 'Later copy', createdAt: '2026-03-01T00:00:00Z' }
    expect(mergeFeedItems([unavailable, older, newer, duplicate, unavailable])).toEqual([newer, older, unavailable])
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
