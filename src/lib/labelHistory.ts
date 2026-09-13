import type { LabelEvent, UnavailableItem } from '../types'

export type LabelHistoryEvent = LabelEvent & { addedAt?: string }

export function labelState(label: LabelEvent): 'Active' | 'Expired' | 'Removed' {
  if (label.negated) return 'Removed'
  if (label.expiresAt && Date.parse(label.expiresAt) <= Date.now()) return 'Expired'
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
  const currentApplications = new Set<string>()
  const history: LabelHistoryEvent[] = []

  for (const event of events) {
    const key = `${event.sourceDid}\u0000${event.subject}\u0000${event.value}`
    if (event.negated) {
      const removals = pendingRemovals.get(key) ?? []
      removals.push(event)
      pendingRemovals.set(key, removals)
      currentApplications.delete(key)
      continue
    }

    const removal = pendingRemovals.get(key)?.pop()
    if (!removal && currentApplications.has(key)) continue
    history.push(
      removal
        ? { ...removal, addedAt: event.createdAt, expiresAt: event.expiresAt }
        : { ...event, addedAt: event.createdAt },
    )
    currentApplications.add(key)
  }

  for (const removals of pendingRemovals.values()) history.push(...removals)
  history.sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id),
  )
  return [...history, ...unavailable]
}
