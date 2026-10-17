import { useDelayedFlag } from '../../hooks/useDelayedFlag'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
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
  const sentinelRef = useInfiniteScrollTrigger({ hasMore, loading, disabled, error, resetKey, load })
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
        <span role="status" className="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" /> Loading…
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          Couldn&apos;t load more.{' '}
          <button
            type="button"
            onClick={load}
            disabled={disabled}
            className="font-medium underline underline-offset-2 disabled:opacity-50"
          >
            Retry
          </button>
        </span>
      )}
    </div>
  )
}
