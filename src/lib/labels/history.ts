import type { LabelEvent, UnavailableItem } from '../../types'

export type LabelHistoryEvent = LabelEvent & { addedAt?: string }

export function labelState(label: LabelEvent, nowMs: number): 'Active' | 'Expired' | 'Removed' {
  if (label.negated) return 'Removed'
  if (label.expiresAt && Date.parse(label.expiresAt) <= nowMs) return 'Expired'
  return 'Active'
}

export function groupLabelHistory(
  items: Array<LabelEvent | UnavailableItem>,
): Array<LabelHistoryEvent | UnavailableItem> {
  const events = items
    .filter((item): item is LabelEvent => item.kind === 'labelEvent')
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
  const unavailable = items.filter((item): item is UnavailableItem => item.kind === 'unavailable')
  const pendingRemovals = new Map<string, LabelEvent[]>()
  const seenApplications = new Set<string>()
  const history: LabelHistoryEvent[] = []

  // Walk newest to oldest, pairing each removal with an older application.
  // Ignore repeated applications until a removal starts another interval.
  for (const event of events) {
    const labelKey = `${event.sourceDid}\u0000${event.subject}\u0000${event.value}`
    if (event.negated) {
      const removals = pendingRemovals.get(labelKey) ?? []
      removals.push(event)
      pendingRemovals.set(labelKey, removals)
      seenApplications.delete(labelKey)
      continue
    }

    const matchingRemoval = pendingRemovals.get(labelKey)?.pop()
    if (matchingRemoval) {
      history.push({ ...matchingRemoval, addedAt: event.createdAt, expiresAt: event.expiresAt })
    } else if (!seenApplications.has(labelKey)) {
      history.push({ ...event, addedAt: event.createdAt })
    }
    seenApplications.add(labelKey)
  }

  for (const removals of pendingRemovals.values()) history.push(...removals)
  history.sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id),
  )
  return [...history, ...unavailable]
}
