import { describe, expect, it } from 'vitest'
import { RequestScheduler } from '../src/data/runtime/requestScheduler'

describe('request scheduling', () => {
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
