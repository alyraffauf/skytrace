import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PagedQueryPagination, PagedQueryRefreshNotice } from '../../components/pagination/PagedQuery'
import { LabelRow } from '../../components/labels/LabelRow'
import { groupLabelHistory, type LabelHistoryEvent } from '../../lib/labels/history'
import { useLabelDisplayNames } from '../../hooks/useLabelDisplayNames'
import { RecordList } from '../../components/records/RecordList'
import { SourceIssues } from '../../components/labels/SourceIssues'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'
import { useAccountLabels } from './useAccountLabels'
import type { UnavailableItem } from '../../types'
import type { ProfileOutletContext } from '../../layouts/profileContext'

export function AccountLabelsPage() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = useAccountLabels(profile.identity.did, service.labelHistory)
  const items = useMemo(() => {
    const entriesById = new Map(query.data?.pages.flatMap((page) => page.items).map((entry) => [entry.id, entry]))
    return groupLabelHistory(Array.from(entriesById.values()))
  }, [query.data?.pages])
  if (query.isPending) return <LoadingRows />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
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
  const labels = useMemo(() => items.filter((item): item is LabelHistoryEvent => item.kind === 'labelEvent'), [items])
  const displayNames = useLabelDisplayNames(labels, service)
  return items.map((item) => (
    <LabelRow
      key={item.id}
      label={item}
      displayName={item.kind === 'labelEvent' ? displayNames.get(item.id) : undefined}
    />
  ))
}
