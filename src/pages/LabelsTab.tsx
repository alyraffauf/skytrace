import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PagedQueryPagination, PagedQueryRefreshNotice } from '../components/PagedQuery'
import { LabelRow } from '../components/LabelRow'
import { groupLabelHistory, type LabelHistoryEvent } from '../lib/labelHistory'
import { useLabelDisplayNames } from '../components/LabelValue'
import { RecordList } from '../components/RecordList'
import { SourceIssues } from '../components/SourceIssues'
import { EmptyState, ErrorState, LoadingRows } from '../components/States'
import type { LabelPagingState } from '../data/labelPaging'
import { queryKeys } from '../data/queryKeys'
import { usePagedRecords } from '../lib/usePagedRecords'
import type { LabelEvent, UnavailableItem } from '../types'
import type { ProfileOutletContext } from './ProfilePage'

export function LabelsTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<LabelEvent | UnavailableItem, LabelPagingState>(
    queryKeys.profileTab(profile.identity.did, 'labels'),
    (cursor, signal) => service.labels(profile.identity.did, cursor, signal),
  )
  useEffect(() => {
    if (query.data?.pages.length === 1 && query.hasNextPage && !query.isFetching && !query.isError) {
      void query.fetchNextPage()
    }
  }, [query.data?.pages.length, query.fetchNextPage, query.hasNextPage, query.isFetching, query.isError])
  if (query.isPending) return <LoadingRows />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const entriesById = new Map(query.data.pages.flatMap((page) => page.items).map((entry) => [entry.id, entry]))
  const items = groupLabelHistory(Array.from(entriesById.values()))
  const issues = query.data.pages.at(-1)?.issues ?? []
  return (
    <div>
      <PagedQueryRefreshNotice query={query} resourceLabel="account labels" />
      {items.length === 0 ? (
        <EmptyState title="No account labels found" />
      ) : (
        <RecordList>
          <ResolvedLabelRows items={items} service={service} />
        </RecordList>
      )}
      {issues.length > 0 && <SourceIssues issues={issues} retry={() => void query.fetchNextPage()} />}
      <PagedQueryPagination query={query} hasMore={query.hasNextPage && issues.length === 0} />
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
  const displayNames = useLabelDisplayNames(labels, service)
  return items.map((item) => (
    <LabelRow
      key={item.id}
      label={item}
      displayName={item.kind === 'labelEvent' ? displayNames.get(item.id) : undefined}
    />
  ))
}
