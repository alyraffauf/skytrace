import { useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { groupLabelHistory, LabelRow, type LabelHistoryEvent } from '../components/LabelRow'
import { useLabelDisplayNames } from '../components/LabelValue'
import { RecordList } from '../components/RecordList'
import { SourceIssues } from '../components/SourceIssues'
import { EmptyState, ErrorState, LoadingRows } from '../components/States'
import type { LabelPagingState } from '../data/labelPaging'
import { queryKeys } from '../data/queryKeys'
import { newestFirst } from '../lib/sorting'
import { usePagedRecords } from '../lib/usePagedRecords'
import type { LabelEvent, UnavailableItem } from '../types'
import type { ProfileOutletContext } from './ProfilePage'

export function LabelsTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<LabelEvent | UnavailableItem, LabelPagingState>(
    queryKeys.profileTab(profile.identity.did, 'labels'),
    (cursor, signal) => service.labels(profile.identity.did, cursor, signal),
  )
  const entries = useMemo(() => {
    if (!query.data) return []
    const entriesById = new Map(query.data.pages.flatMap((page) => page.items).map((entry) => [entry.id, entry]))
    return Array.from(entriesById.values())
  }, [query.data])
  const items = useMemo(() => groupLabelHistory(newestFirst(entries)), [entries])
  useEffect(() => {
    if (query.data?.pages.length === 1 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }, [query.data?.pages.length, query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])
  if (query.isPending) return <LoadingRows />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const issues = query.data.pages.at(-1)?.issues ?? []
  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title="No account labels found" />
      ) : (
        <RecordList>
          <ResolvedLabelRows items={items} service={service} />
        </RecordList>
      )}
      {issues.length > 0 && <SourceIssues issues={issues} retry={() => void query.fetchNextPage()} />}
      <InfiniteScroll
        hasMore={query.hasNextPage && issues.length === 0}
        loading={query.isFetchingNextPage}
        error={query.isFetchNextPageError ? query.error : undefined}
        load={() => void query.fetchNextPage()}
      />
    </div>
  )
}

function ResolvedLabelRows({
  items,
  service,
}: {
  items: Array<LabelHistoryEvent | UnavailableItem>
  service: ProfileOutletContext['service']
}) {
  const labels = items.filter((item): item is LabelHistoryEvent => item.kind === 'labelEvent')
  const displayNameFor = useLabelDisplayNames(labels, service)
  return items.map((item) => (
    <LabelRow key={item.id} label={item} displayName={item.kind === 'labelEvent' ? displayNameFor(item) : undefined} />
  ))
}
