const failedPreloads = new WeakSet<object>()

export function isPreloadError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && failedPreloads.has(error)
}

export function registerPreloadErrorTracking(): () => void {
  const handlePreloadError = (event: Event) => {
    const error = (event as Event & { payload: unknown }).payload
    if (typeof error === 'object' && error !== null) failedPreloads.add(error)
  }

  window.addEventListener('vite:preloadError', handlePreloadError)
  return () => window.removeEventListener('vite:preloadError', handlePreloadError)
}
