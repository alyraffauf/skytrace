import { Badge } from '@astryxdesign/core/Badge'
import { Text } from '@astryxdesign/core/Text'
import { actorReference } from '../../data/recordResults'
import type { LabelHistoryEvent } from '../../lib/labels/history'
import { useLabelState } from '../../hooks/useLabelState'
import { MiniActor } from '../actors/ActorIdentity'
import { formatDate } from '../../lib/dates'
import type { UnavailableItem } from '../../types'
import { compactRowClassName, UnavailableRow } from '../records/RecordList'
import { LabelValue } from './LabelValue'

export function LabelRow({ label, displayName }: { label: LabelHistoryEvent | UnavailableItem; displayName?: string }) {
  const state = useLabelState(label.kind === 'labelEvent' ? label : undefined)
  if (label.kind === 'unavailable') {
    return <UnavailableRow reason={label.reason} />
  }

  const dates = [
    { caption: 'Added', timestamp: label.addedAt ?? (label.negated ? undefined : label.createdAt) },
    label.negated
      ? { caption: 'Removed', timestamp: label.createdAt }
      : { caption: state === 'Expired' ? 'Expired' : 'Expires', timestamp: label.expiresAt },
  ].flatMap(({ caption, timestamp }) => {
    const formatted = formatDate(timestamp)
    return formatted ? [{ caption, timestamp, formatted }] : []
  })

  return (
    <article
      className={`${compactRowClassName} grid grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <LabelValue
            value={label.value}
            displayName={displayName}
            className="min-w-0 break-words text-sm font-semibold leading-4 text-ui-text"
          />
          <Badge label={state} variant={state === 'Active' ? 'purple' : 'neutral'} className="shrink-0" />
        </div>
        <div className="mt-1 min-w-0">
          <MiniActor actor={actorReference(label.sourceDid)} label="By" />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-1 sm:block">
        {dates.map(({ caption, timestamp, formatted }, index) => (
          <Text
            key={caption}
            type="supporting"
            as="p"
            display="block"
            className="sm:text-right"
            aria-label={`${caption} ${formatted}`}
          >
            {index > 0 && (
              <span aria-hidden="true" className="mr-2 sm:hidden">
                ·
              </span>
            )}
            {caption} <time dateTime={timestamp}>{formatted}</time>
          </Text>
        ))}
        {dates.length === 0 && (
          <Text type="supporting" display="block" className="sm:text-right">
            Date unknown
          </Text>
        )}
      </div>
    </article>
  )
}
