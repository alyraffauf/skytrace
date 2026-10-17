import type { LabeledPost, LabelEvent } from '../../types'
import { newestFirst, timestampFor } from '../sorting'

// Keep the first-seen post when a later page adds no labels.
export function mergeLabeledPosts(items: LabeledPost[]): LabeledPost[] {
  const posts = new Map<string, { item: LabeledPost; labels: Map<string, LabelEvent>; changed: boolean }>()
  for (const item of items) {
    const current = posts.get(item.post.uri)
    if (!current) {
      posts.set(item.post.uri, {
        item,
        labels: new Map(item.labels.map((label) => [label.id, label])),
        changed: false,
      })
      continue
    }
    if (!item.labels.some((label) => !current.labels.has(label.id))) continue
    for (const label of item.labels) current.labels.set(label.id, label)
    current.changed = true
  }
  const merged: LabeledPost[] = []
  for (const { item, labels, changed } of posts.values()) {
    merged.push(changed ? { ...item, labels: newestFirst([...labels.values()]) } : item)
  }
  return merged.sort(compareLabeledPostsNewestFirst)
}

export function compareLabeledPostsNewestFirst(left: LabeledPost, right: LabeledPost): number {
  return (
    timestampFor(right.post.createdAt) - timestampFor(left.post.createdAt) ||
    left.post.uri.localeCompare(right.post.uri)
  )
}
