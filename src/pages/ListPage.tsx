import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isRecordKey } from '@atcute/lexicons/syntax'
import { useParams } from 'react-router-dom'
import { MiniActor } from '../components/actors/ActorIdentity'
import { PagedQueryView } from '../components/pagination/PagedQuery'
import { ListAvatar } from '../components/lists/ListRow'
import { RecordLinksMenu } from '../components/records/RecordLinksMenu'
import { RecordList } from '../components/records/RecordList'
import { StreamedListMemberRow } from '../components/lists/StreamedMembershipRows'
import { EmptyState, ErrorState, LoadingRows, UnavailableCard } from '../components/ui/States'
import { formatDate } from '../lib/dates'
import { publicDataServiceFor, type PublicDataService } from '../data/publicData'
import { queryKeys } from '../data/queryKeys'
import { listPurposeLabel } from '../lib/lists'
import { dedupeBy } from '../lib/collections'
import { usePagedRecords } from '../hooks/usePagedRecords'
import type { ListSummary } from '../types'

export function ListPage() {
  const { actor = '', rkey = '' } = useParams()
  const service = publicDataServiceFor(useQueryClient())
  const identityQuery = useQuery(service.core.identityQueryOptions(actor))
  const listUri =
    identityQuery.data && isRecordKey(rkey) ? `at://${identityQuery.data.did}/app.bsky.graph.list/${rkey}` : undefined
  const listQuery = useQuery({
    ...service.graph.listSummaryQueryOptions(listUri),
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

  return <ResolvedListPage list={listQuery.data} service={service} />
}

function UnavailableListPage({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <UnavailableCard reason={reason} />
    </div>
  )
}

function ResolvedListPage({ list, service }: { list: ListSummary; service: PublicDataService }) {
  const moderationListUri = list.purpose.endsWith('#modlist') ? list.uri : undefined
  const listBlockCountQuery = useQuery(service.core.listBlockCountQueryOptions(moderationListUri))
  const membersQuery = usePagedRecords<{ uri: string }>(queryKeys.listMembers(list.uri), (cursor, signal) =>
    service.graph.listMembers(list.uri, cursor, signal),
  )
  const members = dedupeBy(membersQuery.data?.pages.flatMap((page) => page.items) ?? [], (reference) => reference.uri)

  return (
    <article className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <ListAvatar list={list} size="header" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate text-xl font-semibold text-zinc-950 dark:text-zinc-100 sm:text-2xl">{list.name}</h1>
            <span className="text-xs text-violet-700 dark:text-violet-300">{listPurposeLabel(list.purpose)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <MiniActor actor={list.owner} label="By" />
            {list.createdAt && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(list.createdAt)}</span>
            )}
          </div>
        </div>
        <RecordLinksMenu recordUri={list.uri} label={list.name} />
        {list.description && (
          <p className="col-span-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{list.description}</p>
        )}
      </header>

      {listBlockCountQuery.data !== undefined && (
        <div className="border-b border-zinc-200 py-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {listBlockCountQuery.data.toLocaleString()}{' '}
            {listBlockCountQuery.data === 1 ? 'account blocks' : 'accounts block'} this moderation list
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-zinc-200 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Members</h2>
        <span className="hidden w-[10.5rem] pr-[2.5rem] text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:block">
          Date added
        </span>
      </div>

      {membersQuery.isPending ? (
        <LoadingRows count={6} />
      ) : !membersQuery.data ? (
        <ErrorState error={membersQuery.error} retry={() => void membersQuery.refetch()} />
      ) : (
        <PagedQueryView query={membersQuery} resourceLabel="members">
          {membersQuery.isSuccess && members.length === 0 && <EmptyState title="No members found" />}
          {members.length > 0 && (
            <RecordList>
              {members.map((member) => (
                <StreamedListMemberRow
                  key={member.uri}
                  listUri={list.uri}
                  membershipUri={member.uri}
                  service={service}
                />
              ))}
            </RecordList>
          )}
        </PagedQueryView>
      )}
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
