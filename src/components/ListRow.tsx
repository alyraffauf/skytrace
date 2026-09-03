import { MiniActor } from './ActorIdentity'
import { ImageWithFallback } from './Images'
import { RecordLinksMenu } from './RecordLinksMenu'
import { cdnImageUrl } from '../lib/cdn'
import { formatDate } from '../lib/dates'
import { listPurposeLabel } from '../lib/lists'
import { socialListPath } from '../lib/links'
import { parseAtUri } from '../lib/parse'
import { listPath } from '../lib/routes'
import type { ListMembership, ListSummary, UnavailableItem } from '../types'
import { Link } from 'react-router-dom'
import { compactRowClassName, UnavailableRow } from './RecordList'

export function ListRow({ list, membership }: { list: ListSummary | UnavailableItem; membership?: ListMembership }) {
  if (list.kind === 'unavailable') {
    return <UnavailableRow reason={list.reason} />
  }

  const parts = parseAtUri(list.uri)
  const ownerDid = parts?.did ?? ''
  const socialPath = parts ? socialListPath(parts.did, parts.rkey) : undefined
  const internalPath = listPath(list.uri)
  const date = formatDate(membership?.createdAt ?? list.createdAt)
  const details = (
    <>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-0.5">
        <h3 className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-5 text-zinc-950 group-hover:text-violet-700 dark:text-zinc-100 dark:group-hover:text-violet-300 sm:line-clamp-1">
          {list.name}
        </h3>
        <span className="shrink-0 pt-0.5 text-xs text-violet-700 dark:text-violet-300">
          {listPurposeLabel(list.purpose)}
        </span>
      </div>
      {list.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-zinc-600 dark:text-zinc-400 sm:line-clamp-1">
          {list.description}
        </p>
      )}
    </>
  )

  return (
    <article
      className={`${compactRowClassName} group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_2rem]`}
    >
      <ImageWithFallback
        src={list.avatarCid ? cdnImageUrl('avatar', ownerDid, list.avatarCid) : undefined}
        alt={`${list.name} list avatar`}
        fallback="image"
        fallbackClassName="mt-0.5 size-8 shrink-0"
        className="mt-0.5 size-8 shrink-0 bg-zinc-100 object-cover dark:bg-zinc-900"
        loading="lazy"
      />
      <div className="min-w-0">
        {internalPath ? (
          <Link to={internalPath} className="block rounded-sm hover:text-violet-700 dark:hover:text-violet-300">
            {details}
          </Link>
        ) : (
          <div>{details}</div>
        )}
        <div className={`${list.description ? 'mt-1.5' : 'mt-1'} flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1`}>
          <MiniActor actor={list.owner} label="By" />
          <span className="ml-auto shrink-0 text-xs text-zinc-500 dark:text-zinc-400 sm:hidden">
            {date ?? 'Date unknown'}
          </span>
        </div>
      </div>
      <p className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:col-start-3 sm:row-start-1 sm:block sm:text-right">
        {date ?? 'Date unknown'}
      </p>
      <div className="-my-1 col-start-3 row-span-2 row-start-1 self-start sm:col-start-4 sm:row-span-1">
        <RecordLinksMenu recordUri={membership?.uri ?? list.uri} socialPath={socialPath} label={list.name} />
      </div>
    </article>
  )
}
