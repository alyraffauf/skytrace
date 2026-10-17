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
    load,
    consumerSignal,
  }: {
    queryKey: readonly unknown[]
    staleTime: number
    load: (signal: AbortSignal) => Promise<T>
    consumerSignal?: AbortSignal
  }): Promise<T> {
    throwIfAborted(consumerSignal)
    const options = queryOptions({
      queryKey,
      queryFn: ({ signal }) => load(deadlineSignal(signal, this.requestTimeoutMs)),
      staleTime,
    })
    // Imperative callers share the same lifetime accounting as mounted queries.
    const observer = new QueryObserver(this.queryClient, { ...options, enabled: false })
    const unsubscribe = observer.subscribe(() => {})
    const promise = this.queryClient.fetchQuery(options)

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
