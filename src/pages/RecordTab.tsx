import { Fragment, type ReactNode } from 'react'
import { PagedQueryView } from '../components/PagedQuery'
import { RecordList } from '../components/RecordList'
import { EmptyState } from '../components/States'
import { newestFirst } from '../lib/sorting'
import { usePagedRecords } from '../lib/usePagedRecords'
import type { ListMembership, ListSummary, Page, RelationshipEntry, UnavailableItem } from '../types'

type TabRecord = ListMembership | ListSummary | RelationshipEntry | UnavailableItem

export function RecordTab<T extends TabRecord>({
  queryKey,
  resourceLabel,
  empty,
  load,
  itemKey,
  renderItem,
}: {
  queryKey: readonly unknown[]
  resourceLabel: string
  empty: string
  load: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>
  itemKey: (item: T) => string
  renderItem: (item: T) => ReactNode
}) {
  // Underlying record and page queries own automatic retries.
  const query = usePagedRecords(queryKey, load, { retry: false })
  const entries = query.data?.pages.flatMap((page) => page.items) ?? []
  const entriesByKey = new Map(entries.map((entry) => [itemKey(entry), entry]))
  const items = newestFirst(Array.from(entriesByKey.values()))

  return (
    <PagedQueryView query={query} resourceLabel={resourceLabel}>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <RecordList>
          {items.map((item) => (
            <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
          ))}
        </RecordList>
      )}
    </PagedQueryView>
  )
}
