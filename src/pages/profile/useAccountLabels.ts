import { useEffect } from 'react'
import type { LabelHistoryDataService } from '../../data/labels/labelHistoryData'
import type { LabelPagingState } from '../../data/labels/labelPaging'
import { queryKeys } from '../../data/queryKeys'
import type { LabelEvent, UnavailableItem } from '../../types'
import { usePagedRecords } from '../../hooks/usePagedRecords'

export function useAccountLabels(did: string, labelHistory: LabelHistoryDataService) {
  const query = usePagedRecords<LabelEvent | UnavailableItem, LabelPagingState>(
    queryKeys.profileTab(did, 'labels'),
    (cursor, signal) => labelHistory.page(did, cursor, signal),
  )
  useEffect(() => {
    if (query.data?.pages.length === 1 && query.hasNextPage && !query.isFetching && !query.isError) {
      void query.fetchNextPage()
    }
  }, [query.data?.pages.length, query.fetchNextPage, query.hasNextPage, query.isFetching, query.isError])
  return query
}
