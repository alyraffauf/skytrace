// @vitest-environment node
import { getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { RequestScheduler } from '../src/data/runtime/requestScheduler'

describe('request scheduling', () => {
  it.each([false, true])('detaches queued cancellation before execution, failure=%s', async (fails) => {
    const scheduler = new RequestScheduler(1)
    const controller = new AbortController()
    let release!: () => void
    const first = scheduler.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const queued = scheduler.run(async () => {
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
      if (fails) throw new Error('Queued failure')
      return 'done'
    }, controller.signal)
    const completion = fails ? expect(queued).rejects.toThrow('Queued failure') : expect(queued).resolves.toBe('done')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1)
    await Promise.resolve()
    release()
    await first
    await completion
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('removes a cancelled queued operation without preventing the next operation', async () => {
    const scheduler = new RequestScheduler(1)
    const controller = new AbortController()
    let release!: () => void
    const first = scheduler.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const operation = vi.fn(async () => 'cancelled')
    const cancelled = scheduler.run(operation, controller.signal)
    const next = scheduler.run(async () => 'next')
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    release()
    await first
    await expect(next).resolves.toBe('next')
    expect(operation).not.toHaveBeenCalled()
  })

  it('never starts more than six hydration operations', async () => {
    const scheduler = new RequestScheduler(6)
    let active = 0
    let maximum = 0
    await Promise.all(
      Array.from({ length: 18 }, (_, index) =>
        scheduler.run(async () => {
          active += 1
          maximum = Math.max(maximum, active)
          await new Promise((resolve) => setTimeout(resolve, 1))
          active -= 1
          return index
        }),
      ),
    )
    expect(maximum).toBe(6)
  })

  it('releases its slot when an operation throws before returning a promise', async () => {
    const scheduler = new RequestScheduler(1)
    const failed = scheduler.run(() => {
      throw new Error('Synchronous failure')
    })
    const next = scheduler.run(async () => 'next')

    await expect(failed).rejects.toThrow('Synchronous failure')
    await expect(next).resolves.toBe('next')
  })
})
