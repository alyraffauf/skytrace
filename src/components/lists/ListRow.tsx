import { Badge } from '@astryxdesign/core/Badge'
import { MiniActor } from '../actors/ActorIdentity'
import { ImageWithFallback } from '../ui/ImageWithFallback'
import { RecordLinksMenu } from '../records/RecordLinksMenu'
import { cdnImageUrl } from '../../lib/cdn'
import { formatDate } from '../../lib/dates'
import { listPurposeLabel } from '../../lib/lists'
import { socialPathForAtUri } from '../../lib/links'
import { listPath } from '../../routes/paths'
import type { ListMembership, ListSummary, UnavailableItem } from '../../types'
import { Link } from 'react-router-dom'
import { compactRowClassName, UnavailableRow } from '../records/RecordList'

export function ListRow({ list, membership }: { list: ListSummary | UnavailableItem; membership?: ListMembership }) {
  if (list.kind === 'unavailable') {
    return <UnavailableRow reason={list.reason} />
  }

  const internalPath = listPath(list.uri)
  const date = formatDate(membership?.createdAt ?? list.createdAt)
  const details = (
    <>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-0.5">
        <h3 className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-5 text-ui-text group-hover:text-ui-accent sm:line-clamp-1">
          {list.name}
        </h3>
        <Badge label={listPurposeLabel(list.purpose)} variant="purple" />
      </div>
      {list.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-ui-muted sm:line-clamp-1">{list.description}</p>
      )}
    </>
  )

  return (
    <article
      className={`${compactRowClassName} group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_2rem]`}
    >
      <ListAvatar list={list} size="row" />
      <div className="min-w-0">
        {internalPath ? (
          <Link to={internalPath} className="block rounded-ui-inner hover:text-ui-accent">
            {details}
          </Link>
        ) : (
          <div>{details}</div>
        )}
        <div className={`${list.description ? 'mt-1.5' : 'mt-1'} flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1`}>
          <MiniActor actor={list.owner} label="By" />
          <span className="ml-auto shrink-0 text-xs text-ui-muted sm:hidden">{date ?? 'Date unknown'}</span>
        </div>
      </div>
      <p className="hidden text-xs text-ui-muted sm:col-start-3 sm:row-start-1 sm:block sm:text-right">
        {date ?? 'Date unknown'}
      </p>
      <div className="-my-1 col-start-3 row-span-2 row-start-1 self-start sm:col-start-4 sm:row-span-1">
        <RecordLinksMenu
          recordUri={membership?.uri ?? list.uri}
          socialPath={socialPathForAtUri(list.uri)}
          label={list.name}
        />
      </div>
    </article>
  )
}

export function ListAvatar({ list, size }: { list: ListSummary; size: 'row' | 'header' }) {
  const ownerDid = list.owner.did
  const sizeClass = size === 'row' ? 'mt-0.5 size-8 shrink-0' : 'size-12'
  return (
    <ImageWithFallback
      src={list.avatarCid ? cdnImageUrl('avatar', ownerDid, list.avatarCid) : undefined}
      alt={`${list.name} list avatar`}
      fallback="image"
      className={`${sizeClass} bg-ui-subtle object-cover`}
      loading={size === 'header' ? 'eager' : 'lazy'}
    />
  )
}
