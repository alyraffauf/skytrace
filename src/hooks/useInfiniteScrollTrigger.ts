import { useEffect, useEffectEvent, useRef } from 'react'

type InfiniteScrollTriggerOptions = {
  enabled: boolean
  resetKey?: unknown
  load: () => void
}

export function useInfiniteScrollTrigger({ enabled, resetKey, load }: InfiniteScrollTriggerOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadNextPage = useEffectEvent(() => load())

  // Fast cached pages can finish without rendering a loading state. Reobserve when page data changes.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !enabled) return

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
  }, [enabled, resetKey])

  return sentinelRef
}
