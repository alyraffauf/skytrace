const failedPreloads = new WeakSet<object>()
const reloadAttemptKey = `skytrace:preload-reload:${import.meta.url}`

export function isPreloadError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && failedPreloads.has(error)
}

export function registerPreloadRecovery(reload: () => void): () => void {
  let reloadPending = false

  const handlePreloadError = (event: Event) => {
    const error = (event as Event & { payload: unknown }).payload
    if (typeof error === 'object' && error !== null) failedPreloads.add(error)

    if (reloadPending) {
      event.preventDefault()
      return
    }

    try {
      if (window.sessionStorage.getItem(reloadAttemptKey)) return
      window.sessionStorage.setItem(reloadAttemptKey, '1')
    } catch {
      // Without a persisted guard, a reload could repeat indefinitely.
      return
    }

    reloadPending = true
    event.preventDefault()
    reload()
  }

  window.addEventListener('vite:preloadError', handlePreloadError)
  return () => window.removeEventListener('vite:preloadError', handlePreloadError)
}
