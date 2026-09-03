import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'

type InfiniteScrollProps = {
  hasMore: boolean
  loading: boolean
  error?: Error | null
  load: () => void
}

export function InfiniteScroll({ hasMore, loading, error, load }: InfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const showLoading = useDelayedFlag(loading)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loading || error) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        loadRef.current()
      },
      { rootMargin: '160px 0px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [error, hasMore, loading])

  if (!hasMore) return null
  return (
    <div
      ref={sentinelRef}
      data-infinite-scroll
      className={`min-h-px text-center ${showLoading || error ? 'border-b border-zinc-200 py-2 dark:border-zinc-800' : ''}`}
      aria-live="polite"
    >
      {showLoading && (
        <span role="status" className="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" /> Loading more…
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          Couldn&apos;t load more.{' '}
          <button type="button" onClick={load} className="font-medium underline underline-offset-2">
            Retry
          </button>
        </span>
      )}
    </div>
  )
}

function useDelayedFlag(active: boolean, delayMs = 350): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timeout = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timeout)
  }, [active, delayMs])
  return visible
}
