import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import type { Page } from '../types'
import { CACHE_TTL_MS } from '../data/runtime/cachePolicy'
import { hasCursor, type CursorHistory } from '../data/cursorHistory'
import { PublicDataValidationError } from '../data/validationError'

/**
 * The parameter for every page after the first. It carries the string cursors this stream has already requested, so a
 * service that cycles through cursors (a, b, a, ...) fails visibly instead of appending the same pages forever. Each
 * history node is immutable and belongs to one infinite query, so separate streams never share or change history.
 * Object cursors, such as feed and labeled-post paging state, keep their own cycle checks and are not recorded here.
 */
type NextPageParam<TCursor> = {
  cursor: TCursor
  requestedCursors?: CursorHistory
}

export function usePagedRecords<T, TCursor = string>(
  queryKey: readonly unknown[],
  load: (cursor: TCursor | undefined, signal: AbortSignal) => Promise<Page<T, TCursor>>,
) {
  return useInfiniteQuery<
    Page<T, TCursor>,
    Error,
    InfiniteData<Page<T, TCursor>, NextPageParam<TCursor> | undefined>,
    readonly unknown[],
    NextPageParam<TCursor> | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    // Validate here rather than in getNextPageParam: React Query also calls that while computing observer results,
    // where a throw would not become a pagination error.
    queryFn: async ({ pageParam, signal }) => {
      if (typeof pageParam?.cursor === 'string' && hasCursor(pageParam.requestedCursors, pageParam.cursor)) {
        throw new PublicDataValidationError('The service repeated a pagination cursor.')
      }
      return load(pageParam?.cursor, signal)
    },
    getNextPageParam: (page, _pages, requestedPageParam) =>
      page.cursor == null ? undefined : { cursor: page.cursor, requestedCursors: rememberCursor(requestedPageParam) },
    staleTime: CACHE_TTL_MS.activity,
  })
}

function rememberCursor<TCursor>(pageParam: NextPageParam<TCursor> | undefined): CursorHistory | undefined {
  if (typeof pageParam?.cursor !== 'string') return pageParam?.requestedCursors
  return { cursor: pageParam.cursor, previous: pageParam.requestedCursors }
}
