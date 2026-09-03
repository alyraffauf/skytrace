import { abortError, throwIfAborted } from './abort'

type WaitingRequest = {
  signal?: AbortSignal
  start: () => void
  reject: (error: unknown) => void
}

export class RequestScheduler {
  private active = 0
  private readonly waiting: WaitingRequest[] = []

  constructor(private readonly limit: number) {}

  run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal)
    return new Promise<T>((resolve, reject) => {
      const request: WaitingRequest = {
        signal,
        reject,
        start: () => {
          this.active += 1
          Promise.resolve()
            .then(operation)
            .then(resolve, reject)
            .finally(() => {
              this.active -= 1
              this.startNext()
            })
        },
      }
      if (this.active < this.limit) request.start()
      else {
        this.waiting.push(request)
        signal?.addEventListener(
          'abort',
          () => {
            const index = this.waiting.indexOf(request)
            if (index < 0) return
            this.waiting.splice(index, 1)
            reject(abortError(signal))
          },
          { once: true },
        )
      }
    })
  }

  private startNext(): void {
    while (this.active < this.limit && this.waiting.length > 0) {
      const request = this.waiting.shift()!
      if (request.signal?.aborted) request.reject(abortError(request.signal))
      else request.start()
    }
  }
}

export const hydrationRequests = new RequestScheduler(6)
export const paginationRequests = new RequestScheduler(2)
