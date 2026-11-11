import { useDelayedFlag } from '../../hooks/useDelayedFlag'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { useInfiniteScrollTrigger } from '../../hooks/useInfiniteScrollTrigger'

type InfiniteScrollProps = {
  hasMore: boolean
  loading: boolean
  resetKey?: unknown
  disabled?: boolean
  error?: Error | null
  load: () => void
}

export function InfiniteScroll({ hasMore, loading, disabled = false, error, load, resetKey }: InfiniteScrollProps) {
  const sentinelRef = useInfiniteScrollTrigger({
    enabled: hasMore && !loading && !disabled && !error,
    resetKey,
    load,
  })
  const loadingIndicatorVisible = useDelayedFlag(loading)

  if (!hasMore) return null
  return (
    <div
      ref={sentinelRef}
      data-infinite-scroll
      className={`min-h-px text-center ${loadingIndicatorVisible || error ? 'py-2' : ''}`}
      aria-live="polite"
    >
      {loadingIndicatorVisible && (
        <span role="status" className="inline-flex items-center gap-2 text-xs text-ui-muted">
          <Spinner size="sm" shade="subtle" aria-hidden="true" /> Loading…
        </span>
      )}
      {error && (
        <div role="alert" className="text-xs text-ui-error">
          Couldn&apos;t load more.{' '}
          <Button label="Retry" variant="ghost" size="sm" onClick={load} isDisabled={disabled} />
        </div>
      )}
    </div>
  )
}
