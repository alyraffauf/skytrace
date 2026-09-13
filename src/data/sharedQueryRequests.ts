import type { QueryClient } from '@tanstack/react-query'
import { combinedSignal, deadlineSignal, throwIfAborted } from '../lib/abort'

export class SharedQueryRequests {
  private readonly inFlight = new Map<
    string,
    {
      controller: AbortController
      promise: Promise<unknown>
      subscribers: number
      settled: boolean
    }
  >()

  constructor(
    private readonly queryClient: QueryClient,
    private readonly requestTimeoutMs: number,
  ) {}

  query<T>(
    queryKey: readonly unknown[],
    staleTime: number,
    load: (signal: AbortSignal) => Promise<T>,
    consumerSignal?: AbortSignal,
  ): Promise<T> {
    throwIfAborted(consumerSignal)
    const flightKey = JSON.stringify(queryKey)
    let flight = this.inFlight.get(flightKey)
    if (flight?.controller.signal.aborted) {
      return this.waitForSettlement(flight.promise, consumerSignal).then(() =>
        this.query(queryKey, staleTime, load, consumerSignal),
      )
    }
    if (!flight) {
      const controller = new AbortController()
      const created = { controller, subscribers: 0, settled: false, promise: Promise.resolve() as Promise<unknown> }
      created.promise = this.queryClient
        .fetchQuery({
          queryKey,
          queryFn: ({ signal }) =>
            load(deadlineSignal(combinedSignal(controller.signal, signal), this.requestTimeoutMs)),
          staleTime,
        })
        .finally(() => {
          created.settled = true
          if (this.inFlight.get(flightKey) === created) this.inFlight.delete(flightKey)
        })
      flight = created
      this.inFlight.set(flightKey, flight)
    }
    flight.subscribers += 1

    return new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = (complete: () => void) => {
        if (finished) return
        finished = true
        consumerSignal?.removeEventListener('abort', abort)
        flight!.subscribers -= 1
        if (flight!.subscribers === 0 && !flight!.settled) {
          flight!.controller.abort()
        }
        complete()
      }
      const abort = () =>
        finish(() => reject(consumerSignal?.reason ?? new DOMException('The request was aborted.', 'AbortError')))
      consumerSignal?.addEventListener('abort', abort, { once: true })
      if (consumerSignal?.aborted) return abort()
      flight!.promise.then(
        (value) => finish(() => resolve(value as T)),
        (error) => finish(() => reject(error)),
      )
    })
  }

  private waitForSettlement(promise: Promise<unknown>, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    return new Promise((resolve, reject) => {
      let finished = false
      const finish = (complete: () => void) => {
        if (finished) return
        finished = true
        signal?.removeEventListener('abort', abort)
        complete()
      }
      const abort = () =>
        finish(() => reject(signal?.reason ?? new DOMException('The request was aborted.', 'AbortError')))
      signal?.addEventListener('abort', abort, { once: true })
      promise.then(
        () => finish(resolve),
        () => finish(resolve),
      )
    })
  }
}
