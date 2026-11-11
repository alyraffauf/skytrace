import { Button } from '@astryxdesign/core/Button'
import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { InfiniteScroll } from './InfiniteScroll'
import { EmptyState, LoadingRows } from '../ui/States'

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
    <>
      <PagedQueryRefreshNotice query={query} resourceLabel={resourceLabel} />
      {children}
      {!query.isRefetchError && (
        <div className={paginationClassName}>
          <PagedQueryPagination query={query} />
        </div>
      )}
    </>
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
  hasMore,
}: {
  query: UseInfiniteQueryResult<unknown, Error>
  hasMore?: boolean
}) {
  const paginationError = query.isFetchNextPageError ? query.error : undefined
  if (query.isRefetchError) return null
  return (
    <InfiniteScroll
      hasMore={hasMore ?? query.hasNextPage}
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
        action={<Button label={isRetrying ? 'Trying again…' : 'Retry'} isDisabled={isRetrying} onClick={retry} />}
      >
        {isInitialLoad
          ? 'Try again in a moment.'
          : `Showing previously loaded ${resourceLabel}. Try again in a moment.`}
      </EmptyState>
    </div>
  )
}
