type DatedItem = { kind: string; createdAt?: string }

export function newestFirst<T extends DatedItem>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, timestamp: timestampFor(item.createdAt) }))
    .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
    .map(({ item }) => item)
}

export function timestampFor(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}
