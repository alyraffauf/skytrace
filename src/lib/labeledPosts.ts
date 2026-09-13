import type { LabeledPost, LabelEvent } from '../types'
import { compareLabeledPostsNewestFirst, timestampFor } from './sorting'

// Keep the first-seen post when a later page adds no labels.
export function mergeLabeledPosts(items: LabeledPost[]): LabeledPost[] {
  const posts = new Map<string, LabeledPost>()
  for (const item of items) {
    const current = posts.get(item.post.uri)
    if (!current) {
      posts.set(item.post.uri, item)
      continue
    }
    const labels = new Map<string, LabelEvent>()
    for (const label of [...current.labels, ...item.labels]) labels.set(label.id, label)
    if (labels.size === current.labels.length) continue
    posts.set(item.post.uri, {
      ...current,
      labels: [...labels.values()].sort((left, right) => timestampFor(right.createdAt) - timestampFor(left.createdAt)),
    })
  }
  return [...posts.values()].sort(compareLabeledPostsNewestFirst)
}
