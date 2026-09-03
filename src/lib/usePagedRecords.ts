import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import type { Page } from '../types'
import { CACHE_TTL_MS } from './cache'

export function usePagedRecords<T, TCursor = string>(
  queryKey: readonly unknown[],
  load: (cursor: TCursor | undefined, signal: AbortSignal) => Promise<Page<T, TCursor>>,
) {
  return useInfiniteQuery<
    Page<T, TCursor>,
    Error,
    InfiniteData<Page<T, TCursor>, TCursor | undefined>,
    readonly unknown[],
    TCursor | undefined
  >({
    queryKey,
    queryFn: ({ pageParam, signal }) => load(pageParam as TCursor | undefined, signal),
    initialPageParam: undefined as TCursor | undefined,
    getNextPageParam: (page) => page.cursor,
    staleTime: CACHE_TTL_MS.activity,
  })
}
