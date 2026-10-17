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
      const finish = (complete: () => void) => {
        if (finished) return
        finished = true
        consumerSignal?.removeEventListener('abort', abort)
        unsubscribe()
        complete()
      }
      const abort = () =>
        finish(() => reject(consumerSignal?.reason ?? new DOMException('The request was aborted.', 'AbortError')))
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
      consumerSignal?.addEventListener('abort', abort, { once: true })
      if (consumerSignal?.aborted) abort()
    })
  }
}
