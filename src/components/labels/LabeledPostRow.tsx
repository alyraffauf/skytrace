import { Text } from '@astryxdesign/core/Text'
import { TagIcon } from '@heroicons/react/16/solid'
import { actorReference } from '../../data/recordResults'
import { MiniActor } from '../actors/ActorIdentity'
import { FeedRow } from '../feed/FeedRow'
import { useLabelState } from '../../hooks/useLabelState'
import { formatDate } from '../../lib/dates'
import type { LabeledPost } from '../../types'
import { LabelValue } from './LabelValue'
import type { PublicDataService } from '../../data/publicData'

export function LabeledPostRow({
  item,
  displayNames,
  service,
}: {
  item: LabeledPost
  displayNames?: ReadonlyMap<string, string>
  service: PublicDataService
}) {
  return (
    <FeedRow
      item={item.post}
      service={service}
      footer={<PostLabels labels={item.labels} displayNames={displayNames} />}
    />
  )
}

function PostLabels({
  labels,
  displayNames,
}: {
  labels: LabeledPost['labels']
  displayNames?: ReadonlyMap<string, string>
}) {
  return (
    <section aria-label="Post labels" className="mt-3 border-t border-ui-border pt-3">
      <ul className="grid gap-3">
        {labels.map((label) => (
          <PostLabel key={label.id} label={label} displayName={displayNames?.get(label.id)} />
        ))}
      </ul>
    </section>
  )
}

function PostLabel({ label, displayName }: { label: LabeledPost['labels'][number]; displayName?: string }) {
  const state = useLabelState(label)
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 gap-y-1">
      <TagIcon className="mt-0.5 size-4 text-ui-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <Text type="supporting" color="primary" weight="medium" className="min-w-0 wrap-anywhere">
          <LabelValue value={label.value} displayName={displayName} />
        </Text>
        {state !== 'Active' && <Text type="supporting">{state}</Text>}
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <MiniActor actor={actorReference(label.sourceDid)} avatarSize="inline" />
        <Text type="supporting" className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true">·</span>
          <time dateTime={label.createdAt}>{formatDate(label.createdAt) ?? 'Date unknown'}</time>
        </Text>
      </div>
    </li>
  )
}
