import { Fragment, type ReactNode, useMemo } from 'react'
import { PagedQueryView } from './PagedQuery'
import { RecordList } from '../records/RecordList'
import { EmptyState } from '../ui/States'
import { newestFirst } from '../../lib/sorting'
import { usePagedRecords } from '../../hooks/usePagedRecords'
import type { ListSummary, Page, RelationshipEntry, UnavailableItem } from '../../types'

type TabRecord = ListSummary | RelationshipEntry | UnavailableItem

export function RecordTab<T extends TabRecord>({
  queryKey,
  resourceLabel,
  emptyTitle,
  load,
  itemKey,
  renderItem,
}: {
  queryKey: readonly unknown[]
  resourceLabel: string
  emptyTitle: string
  load: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>
  itemKey: (item: T) => string
  renderItem: (item: T) => ReactNode
}) {
  const query = usePagedRecords(queryKey, load)
  const items = useMemo(() => {
    const entries = query.data?.pages.flatMap((page) => page.items) ?? []
    const entriesByKey = new Map(entries.map((entry) => [itemKey(entry), entry]))
    return newestFirst(Array.from(entriesByKey.values()))
  }, [query.data?.pages, itemKey])

  return (
    <PagedQueryView query={query} resourceLabel={resourceLabel}>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} />
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
