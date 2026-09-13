import { labelState, type LabelHistoryEvent } from '../../lib/labelHistory'
import { MiniActor } from '../actors/ActorIdentity'
import { formatDate } from '../../lib/dates'
import type { UnavailableItem } from '../../types'
import { compactRowClassName, UnavailableRow } from '../records/RecordList'
import { LabelValue } from './LabelValue'

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
            className="min-w-0 break-words text-sm font-semibold leading-4 text-zinc-950 dark:text-zinc-100"
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
