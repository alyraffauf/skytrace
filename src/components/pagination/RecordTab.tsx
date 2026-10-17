import { Fragment, type ReactNode } from 'react'
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
  return (
    <PagedQueryView query={query} resourceLabel={resourceLabel}>
      <RecordTabContents pages={query.data?.pages} emptyTitle={emptyTitle} itemKey={itemKey} renderItem={renderItem} />
    </PagedQueryView>
  )
}

function RecordTabContents<T extends TabRecord>({
  pages,
  emptyTitle,
  itemKey,
  renderItem,
}: {
  pages: Page<T>[] | undefined
  emptyTitle: string
  itemKey: (item: T) => string
  renderItem: (item: T) => ReactNode
}) {
  const entries = pages?.flatMap((page) => page.items) ?? []
  const entriesByKey = new Map(entries.map((entry) => [itemKey(entry), entry]))
  const items = newestFirst(Array.from(entriesByKey.values()))
  if (items.length === 0) return <EmptyState title={emptyTitle} />
  return (
    <RecordList>
      {items.map((item) => (
        <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
      ))}
    </RecordList>
  )
}
