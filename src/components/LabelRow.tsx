import { MiniActor } from './ActorIdentity'
import { formatDate } from '../lib/dates'
import type { LabelEvent, UnavailableItem } from '../types'
import { compactRowClassName, UnavailableRow } from './RecordList'
import { LabelValue } from './LabelValue'

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

export function LabelRow({ label, displayName }: { label: LabelHistoryEvent | UnavailableItem; displayName?: string }) {
  if (label.kind === 'unavailable') {
    return <UnavailableRow reason={label.reason} />
  }

  const state = labelState(label)
  const added = formatDate(label.addedAt ?? (label.negated ? undefined : label.createdAt))
  const expiry = formatDate(label.expiresAt)
  const removed = label.negated ? formatDate(label.createdAt) : undefined

  return (
    <article className={`${compactRowClassName} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <LabelValue
            value={label.value}
            displayName={displayName}
            className="min-w-0 break-words text-sm font-semibold leading-4 text-zinc-950 [overflow-wrap:anywhere] dark:text-zinc-100"
          />
          <span
            className={`shrink-0 text-xs font-medium ${state === 'Active' ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            {state}
          </span>
        </div>
        <div className="mt-1 min-w-0">
          <MiniActor actor={label.source} label="By" />
        </div>
      </div>
      <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
        {added && (
          <p aria-label={`Added ${added}`}>
            <span>Added </span>
            <time dateTime={label.addedAt ?? label.createdAt}>{added}</time>
          </p>
        )}
        {removed && (
          <p aria-label={`Removed ${removed}`}>
            <span>Removed </span>
            <time dateTime={label.createdAt}>{removed}</time>
          </p>
        )}
        {!removed && expiry && (
          <p aria-label={`${state === 'Expired' ? 'Expired' : 'Expires'} ${expiry}`}>
            <span>{state === 'Expired' ? 'Expired' : 'Expires'} </span>
            <time dateTime={label.expiresAt}>{expiry}</time>
          </p>
        )}
        {!added && !removed && <span>Date unknown</span>}
      </div>
    </article>
  )
}
