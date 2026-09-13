import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { InfiniteScroll } from './InfiniteScroll'
import { EmptyState, LoadingRows } from './States'

export function PagedQueryView({
  query,
  resourceLabel,
  loadingCount = 3,
  children,
  paginationClassName,
}: {
  query: UseInfiniteQueryResult<unknown, Error>
  resourceLabel: string
  loadingCount?: number
  children: ReactNode
  paginationClassName?: string
}) {
  if (query.isPending) return <LoadingRows count={loadingCount} />
  if (!query.data) {
    return (
      <PagedQueryError
        resourceLabel={resourceLabel}
        mode="initial"
        isRetrying={query.isFetching}
        retry={() => void query.refetch()}
      />
    )
  }
  return (
    <div>
      <PagedQueryRefreshNotice query={query} resourceLabel={resourceLabel} />
      {children}
      {!query.isRefetchError && (
        <div className={paginationClassName}>
          <PagedQueryPagination query={query} />
        </div>
      )}
    </div>
  )
}

export function PagedQueryRefreshNotice({
  query,
  resourceLabel,
}: {
  query: UseInfiniteQueryResult<unknown, Error>
  resourceLabel: string
}) {
  if (!query.isRefetchError) return null
  return (
    <PagedQueryError
      resourceLabel={resourceLabel}
      mode="refresh"
      isRetrying={query.isFetching}
      retry={() => void query.refetch()}
    />
  )
}

export function PagedQueryPagination({
  query,
  hasMore = query.hasNextPage,
}: {
  query: UseInfiniteQueryResult<unknown, Error>
  hasMore?: boolean
}) {
  const paginationError = query.isFetchNextPageError ? query.error : undefined
  if (query.isRefetchError) return null
  return (
    <InfiniteScroll
      hasMore={hasMore}
      resetKey={query.data}
      disabled={query.isFetching}
      loading={query.isFetchingNextPage}
      error={paginationError}
      load={() => void query.fetchNextPage()}
    />
  )
}

function PagedQueryError({
  resourceLabel,
  mode,
  isRetrying,
  retry,
}: {
  resourceLabel: string
  mode: 'initial' | 'refresh'
  isRetrying: boolean
  retry: () => void
}) {
  const isInitialLoad = mode === 'initial'
  return (
    <div role="alert">
      <EmptyState
        title={`Couldn't ${isInitialLoad ? 'load' : 'refresh'} ${resourceLabel}`}
        className={isInitialLoad ? 'mt-8 border-none py-12 sm:mt-12' : ''}
        action={
          <button
            type="button"
            disabled={isRetrying}
            onClick={retry}
            className="inline-flex min-h-9 items-center justify-center rounded-sm border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {isRetrying ? 'Trying again…' : 'Retry'}
          </button>
        }
      >
        {isInitialLoad
          ? 'Try again in a moment.'
          : `Showing previously loaded ${resourceLabel}. Try again in a moment.`}
      </EmptyState>
    </div>
  )
}
