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
  const paginationError = query.isFetchNextPageError ? query.error : undefined
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
      {query.isRefetchError && (
        <PagedQueryError
          resourceLabel={resourceLabel}
          mode="refresh"
          isRetrying={query.isFetching}
          retry={() => void query.refetch()}
        />
      )}
      {children}
      {!query.isRefetchError && (
        <div className={paginationClassName}>
          <InfiniteScroll
            hasMore={query.hasNextPage}
            disabled={query.isFetching}
            loading={query.isFetchingNextPage}
            error={paginationError}
            load={() => void query.fetchNextPage()}
          />
        </div>
      )}
    </div>
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
