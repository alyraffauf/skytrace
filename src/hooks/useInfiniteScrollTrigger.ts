import { useEffect, useEffectEvent, useRef } from 'react'

type InfiniteScrollTriggerOptions = {
  hasMore: boolean
  loading: boolean
  disabled?: boolean
  error?: Error | null
  resetKey?: unknown
  load: () => void
}

export function useInfiniteScrollTrigger({
  hasMore,
  loading,
  disabled = false,
  error,
  resetKey,
  load,
}: InfiniteScrollTriggerOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadNextPage = useEffectEvent(() => load())

  // Fast cached pages can finish without rendering a loading state. Reobserve when page data changes.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loading || disabled || error) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        loadNextPage()
      },
      { rootMargin: '160px 0px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [disabled, error, hasMore, loading, resetKey])

  return sentinelRef
}
