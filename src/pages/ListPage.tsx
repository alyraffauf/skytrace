import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isRecordKey } from '@atcute/lexicons/syntax'
import { Link, useParams } from 'react-router-dom'
import { MiniActor } from '../components/ActorIdentity'
import { ImageWithFallback } from '../components/Images'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { RecordLinksMenu } from '../components/RecordLinksMenu'
import { RelationshipRow } from '../components/RelationshipRow'
import { RecordList } from '../components/RecordList'
import { EmptyState, ErrorState, LoadingRows, UnavailableCard } from '../components/States'
import { cdnImageUrl } from '../lib/cdn'
import { formatDate } from '../lib/dates'
import { publicDataServiceFor, type PublicDataService } from '../data/publicData'
import { queryKeys } from '../data/queryKeys'
import { listPurposeLabel } from '../lib/lists'
import { socialListPath } from '../lib/links'
import { parseAtUri } from '../lib/parse'
import { profileTabPath } from '../lib/routes'
import { newestFirst } from '../lib/sorting'
import { usePagedRecords } from '../lib/usePagedRecords'
import type { ListSummary, RelationshipEntry, UnavailableItem } from '../types'

export function ListPage() {
  const { actor = '', rkey = '' } = useParams()
  const service = publicDataServiceFor(useQueryClient())
  const identityQuery = useQuery(service.identityQueryOptions(actor))
  const listUri =
    identityQuery.data && isRecordKey(rkey) ? `at://${identityQuery.data.did}/app.bsky.graph.list/${rkey}` : undefined
  const listQuery = useQuery({
    ...service.listSummaryQueryOptions(listUri),
    enabled: Boolean(listUri),
  })

  if (identityQuery.isError)
    return <ErrorState error={identityQuery.error} retry={() => void identityQuery.refetch()} />
  if (identityQuery.isPending) return <ListPageSkeleton />
  if (!listUri) return <UnavailableListPage reason="This list address is invalid." />
  if (listQuery.isError) return <ErrorState error={listQuery.error} retry={() => void listQuery.refetch()} />
  if (listQuery.isPending) return <ListPageSkeleton />
  if (!listQuery.data) return <UnavailableListPage reason="This list is unavailable." />
  if (listQuery.data.kind === 'unavailable') return <UnavailableListPage reason={listQuery.data.reason} />

  return <ResolvedListPage list={listQuery.data} listUri={listUri} service={service} />
}

function UnavailableListPage({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <UnavailableCard bordered reason={reason} />
    </div>
  )
}

function ResolvedListPage({
  list,
  listUri,
  service,
}: {
  list: ListSummary
  listUri: string
  service: PublicDataService
}) {
  const listRecord = parseAtUri(list.uri)!
  const membersQuery = usePagedRecords<RelationshipEntry | UnavailableItem>(
    queryKeys.listMembers(listUri),
    (cursor, signal) => service.listMembers(listUri, cursor, signal),
  )
  const members = newestFirst(membersQuery.data?.pages.flatMap((page) => page.items) ?? [])
  const paginationError = membersQuery.isFetchNextPageError ? membersQuery.error : undefined

  return (
    <article className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <ImageWithFallback
          src={list.avatarCid ? cdnImageUrl('avatar', listRecord.did, list.avatarCid) : undefined}
          alt={`${list.name} list avatar`}
          fallback="image"
          fallbackClassName="size-12"
          className="size-12 bg-zinc-100 object-cover dark:bg-zinc-900"
          loading="eager"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate text-xl font-semibold text-zinc-950 dark:text-zinc-100 sm:text-2xl">{list.name}</h1>
            <span className="text-xs text-rose-700 dark:text-rose-300">{listPurposeLabel(list.purpose)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <MiniActor actor={list.owner} label="By" />
            {list.createdAt && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(list.createdAt)}</span>
            )}
          </div>
        </div>
        <RecordLinksMenu
          recordUri={list.uri}
          socialPath={socialListPath(listRecord.did, listRecord.rkey)}
          label={list.name}
        />
        {list.description && (
          <p className="col-span-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{list.description}</p>
        )}
      </header>

      <div className="flex items-center justify-between border-b border-zinc-200 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Members</h2>
        <Link
          to={profileTabPath(listRecord.did, 'lists')}
          className="text-xs text-zinc-500 hover:text-rose-700 dark:text-zinc-400 dark:hover:text-rose-300"
        >
          Owner's lists
        </Link>
      </div>

      {membersQuery.isPending && <LoadingRows count={6} />}
      {membersQuery.isError && !membersQuery.data && (
        <ErrorState error={membersQuery.error} retry={() => void membersQuery.refetch()} />
      )}
      {membersQuery.isSuccess && members.length === 0 && <EmptyState title="No members found" />}
      {members.length > 0 && (
        <RecordList>
          {members.map((member) => (
            <RelationshipRow key={member.id} entry={member} />
          ))}
        </RecordList>
      )}
      <InfiniteScroll
        hasMore={membersQuery.hasNextPage}
        loading={membersQuery.isFetchingNextPage}
        error={paginationError}
        load={() => void membersQuery.fetchNextPage()}
      />
    </article>
  )
}

function ListPageSkeleton() {
  return (
    <div aria-label="Loading list" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex gap-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div className="skeleton size-12" />
        <div className="flex-1">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton mt-2 h-3 w-32" />
        </div>
      </div>
      <div className="mt-4">
        <LoadingRows count={6} />
      </div>
    </div>
  )
}
