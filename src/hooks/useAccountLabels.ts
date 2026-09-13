import { useEffect } from 'react'
import type { LabelDataService } from '../data/labelData'
import type { LabelPagingState } from '../data/labelPaging'
import { queryKeys } from '../data/queryKeys'
import type { LabelEvent, UnavailableItem } from '../types'
import { usePagedRecords } from './usePagedRecords'

export function useAccountLabels(did: string, labelsService: LabelDataService) {
  const query = usePagedRecords<LabelEvent | UnavailableItem, LabelPagingState>(
    queryKeys.profileTab(did, 'labels'),
    (cursor, signal) => labelsService.labels(did, cursor, signal),
  )
  useEffect(() => {
    if (query.data?.pages.length === 1 && query.hasNextPage && !query.isFetching && !query.isError) {
      void query.fetchNextPage()
    }
  }, [query.data?.pages.length, query.fetchNextPage, query.hasNextPage, query.isFetching, query.isError])
  return query
}
