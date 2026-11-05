import { QueryObserver, queryOptions, type QueryClient } from '@tanstack/react-query'
import { deadlineSignal, throwIfAborted } from '../../lib/abort'

export type DataRequestContext = {
  queryClient: QueryClient
  sharedRequests: SharedQueryRequests
  requestTimeoutMs: number
}

export class SharedQueryRequests {
  constructor(
    private readonly queryClient: QueryClient,
    private readonly requestTimeoutMs: number,
  ) {}

  query<T>({
    queryKey,
    staleTime,
    gcTime,
    load,
    consumerSignal,
    requestTimeoutMs = this.requestTimeoutMs,
  }: {
    queryKey: readonly unknown[]
    staleTime: number
    gcTime?: number
    load: (signal: AbortSignal) => Promise<T>
    consumerSignal?: AbortSignal
    /** Undefined uses the default deadline; null disables it. Aggregate scans apply deadlines to each I/O request. */
    requestTimeoutMs?: number | null
  }): Promise<T> {
    throwIfAborted(consumerSignal)
    const options = queryOptions({
      queryKey,
      queryFn: ({ signal }) => load(requestTimeoutMs === null ? signal : deadlineSignal(signal, requestTimeoutMs)),
      staleTime,
      ...(gcTime === undefined ? {} : { gcTime }),
    })
    // Imperative callers share the same lifetime accounting as mounted queries.
    const observer = new QueryObserver(this.queryClient, { ...options, enabled: false })
    const unsubscribe = observer.subscribe(() => {})
    const promise = this.queryClient.query(options)

    return new Promise<T>((resolve, reject) => {
      let finished = false
      const cleanup = () => {
        if (finished) return
        finished = true
        consumerSignal?.removeEventListener('abort', abort)
        unsubscribe()
      }
      const resolveConsumer = (value: T) => {
        if (finished) return
        cleanup()
        resolve(value)
      }
      const rejectConsumer = (error: unknown) => {
        if (finished) return
        cleanup()
        reject(error)
      }
      const abort = () => {
        const reason = consumerSignal?.reason ?? new DOMException('The request was aborted.', 'AbortError')
        rejectConsumer(reason)
      }
      promise.then(resolveConsumer, rejectConsumer)
      consumerSignal?.addEventListener('abort', abort, { once: true })
      if (consumerSignal?.aborted) abort()
    })
  }
}
