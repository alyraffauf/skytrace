import { memo } from 'react'
import { MiniActor } from './ActorIdentity'
import { FeedRow } from './FeedRow'
import { labelState } from './LabelRow'
import { formatDate } from '../lib/dates'
import type { LabelEvent, LabeledPost } from '../types'
import { LabelValue } from './LabelValue'

export type LabelDisplayNameFor = (label: LabelEvent) => string | undefined

export const LabeledPostRow = memo(function LabeledPostRow({
  item,
  displayNameFor,
}: {
  item: LabeledPost
  displayNameFor?: LabelDisplayNameFor
}) {
  return <FeedRow item={item.post} footer={<PostLabels labels={item.labels} displayNameFor={displayNameFor} />} />
})

function PostLabels({
  labels,
  displayNameFor,
}: {
  labels: LabeledPost['labels']
  displayNameFor?: LabelDisplayNameFor
}) {
  return (
    <section aria-label="Post labels" className="mt-2 border-l-2 border-violet-200 pl-2.5 dark:border-violet-900">
      <h3 className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Post labels</h3>
      <ul className="mt-0.5">
        {labels.map((label) => {
          const state = labelState(label)
          return (
            <li key={label.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-0.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <LabelValue
                  value={label.value}
                  displayName={displayNameFor?.(label)}
                  className="truncate font-semibold text-zinc-900 dark:text-zinc-100"
                />
                {state !== 'Active' && (
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{state}</span>
                )}
              </div>
              <time dateTime={label.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400">
                {formatDate(label.createdAt) ?? 'Date unknown'}
              </time>
              <div className="col-span-2 mt-0.5 min-w-0">
                <MiniActor actor={label.source} label="By" />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
