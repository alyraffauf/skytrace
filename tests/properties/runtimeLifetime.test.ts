// @vitest-environment node
import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { runCancellableScan, type ScanScope } from '../../src/data/runtime/scanCancellation'
import { SharedQueryRequests } from '../../src/data/runtime/sharedQueryRequests'
import { deferred, histories, observe, settle } from './runtimeModel'

it('isolates scan cancellation while enforcing a shared deadline and collecting idle entries', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const timeoutReason = new DOMException('deadline', 'TimeoutError')
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const deadline = new AbortController()
    setTimeout(() => deadline.abort(timeoutReason), ms)
    return deadline.signal
  })
  await histories('lifetime', async (draw, event) => {
    const gcTime = draw(4)
    const defaultDeadline = 5
    const override = [null, undefined, 2][draw(3)]
    const expires = override === null ? Infinity : (override ?? defaultDeadline)
    const sharedKey = ['record']
    const client = new QueryClient()
    const requests = new SharedQueryRequests(client, defaultDeadline)
    const io = deferred<number>()
    const load = vi.fn((signal: AbortSignal) => {
      signal.addEventListener('abort', () => io.reject(signal.reason), { once: true })
      return io.promise
    })
    const read = (consumerSignal?: AbortSignal) =>
      requests.query({
        queryKey: sharedKey,
        gcTime,
        staleTime: Infinity,
        requestTimeoutMs: override,
        consumerSignal,
        load,
      })
    try {
      let scope!: ScanScope
      const scan = observe(
        runCancellableScan(undefined, (current) => {
          scope = current
          return read(current.signal)
        }),
      )
      const independent = observe(read())
      const stopError = new Error('sibling failed')
      const stopScan = draw(2) === 0
      if (stopScan) {
        scope.stop(stopError)
        event('stop-scan')
      }
      const elapsed = [1, 2, 4, 5, 6][draw(5)]
      vi.advanceTimersByTime(elapsed)
      await settle()
      const timedOut = elapsed >= expires
      expect(independent.outcome).toBe(timedOut ? timeoutReason : 'pending')
      io.resolve(1)
      await settle()
      expect(load).toHaveBeenCalledTimes(1)
      expect(scan.outcome).toBe(stopScan ? stopError : timedOut ? timeoutReason : 1)
      expect(independent.outcome).toBe(timedOut ? timeoutReason : 1)
      event(timedOut ? 'timeout' : 'within-deadline')
      // gcTime=0 still retains data until the next timer turn.
      if (!timedOut) expect(client.getQueryData(sharedKey)).toBe(1)
      const idle = draw(5)
      vi.advanceTimersByTime(idle)
      const collected = idle >= gcTime
      expect(Boolean(client.getQueryState(sharedKey))).toBe(!collected)
      event(collected ? 'collected' : 'retained')
      const recovered = await requests.query({ queryKey: sharedKey, gcTime, staleTime: Infinity, load: async () => 2 })
      expect(recovered).toBe(timedOut || collected ? 2 : 1)
      if (timedOut) event('retry-after-timeout')
    } finally {
      client.clear()
      vi.clearAllTimers()
    }
  })
})
