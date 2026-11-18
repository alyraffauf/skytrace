// @vitest-environment node
import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { SharedQueryRequests } from '../../src/data/runtime/sharedQueryRequests'
import { deferred, histories, observe, settle } from './runtimeModel'

it('shares live loads, returns fresh values and isolates abandoned or failed generations', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  await histories('shared', async (draw, event) => {
    vi.setSystemTime(1_000_000)
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
    const shared = new SharedQueryRequests(client, 1000)
    const ttl = 5
    const cache = new Map<number, { value: number; written: number }>()
    const generations: { key: number; abandoned: boolean; settled: boolean }[] = []
    const loads: { key: number; signal: AbortSignal; gate: ReturnType<typeof deferred<number>> }[] = []
    const readers: {
      generation?: number
      outcome: unknown
      controller: AbortController
      actual: ReturnType<typeof observe>
    }[] = []
    try {
      for (let step = 0; step < 70; step++) {
        const action = draw(12)
        const live = readers.filter((reader) => reader.outcome === 'pending')
        const unsettled = generations.map((g, id) => ({ ...g, id })).filter((g) => !g.settled)
        if (action < 5 || (!live.length && !unsettled.length && action < 10)) {
          const key = draw(3)
          const controller = new AbortController()
          const cached = cache.get(key)
          const earlyAbort = draw(20) === 0
          if (earlyAbort) controller.abort('caller left')
          let outcome: unknown = 'pending'
          let generation: number | undefined
          if (earlyAbort) {
            event('pre-abort')
            outcome = controller.signal.reason
          } else if (cached && Date.now() < cached.written + ttl) {
            outcome = cached.value
            event('fresh-hit')
          } else {
            generation = generations.findIndex((g) => g.key === key && !g.settled && !g.abandoned)
            if (generation < 0) {
              generation = generations.length
              generations.push({ key, abandoned: false, settled: false })
              event(cached ? (Date.now() === cached.written + ttl ? 'refresh-at-ttl' : 'refresh') : 'miss')
            } else event('join')
          }
          const read = async () =>
            shared.query({
              queryKey: [key],
              consumerSignal: controller.signal,
              requestTimeoutMs: null,
              staleTime: ttl,
              load: (signal) => {
                const gate = deferred<number>()
                loads.push({ key, signal, gate })
                return gate.promise
              },
            })
          readers.push({ generation, controller, outcome, actual: observe(read()) })
        } else if (action < 7 && live.length) {
          const reader = live[draw(live.length)]
          reader.controller.abort('caller left')
          reader.outcome = 'caller left'
          if (!readers.some((other) => other.generation === reader.generation && other.outcome === 'pending')) {
            generations[reader.generation!].abandoned = true
            event('cancel-last')
          } else event('cancel-one')
        } else if (action < 10 && unsettled.length) {
          const generation = unsettled[draw(unsettled.length)]
          const value = generation.id
          const fails = draw(3) === 0
          const outcome = fails ? new Error('transport ' + value) : value
          if (fails) loads[value].gate.reject(outcome)
          else loads[value].gate.resolve(value)
          generations[value].settled = true
          if (!generation.abandoned && !fails) cache.set(generation.key, { value, written: Date.now() })
          for (const reader of live.filter((reader) => reader.generation === value)) reader.outcome = outcome
          event((generation.abandoned ? 'late-' : '') + (fails ? 'fail' : 'success'))
        } else {
          vi.advanceTimersByTime([1, ttl - 1, ttl, ttl + 1][draw(4)])
          event('tick')
        }
        await settle()
        expect(loads.map((load) => [load.key, load.signal.aborted])).toEqual(
          generations.map((g) => [g.key, g.abandoned]),
        )
        expect(readers.map((reader) => reader.actual.outcome)).toEqual(readers.map((reader) => reader.outcome))
        for (let key = 0; key < 3; key++) {
          expect(client.getQueryData([key])).toBe(cache.get(key)?.value)
          const waiting = readers.filter((r) => r.outcome === 'pending' && generations[r.generation!].key === key)
          expect(
            client
              .getQueryCache()
              .find({ queryKey: [key] })
              ?.getObserversCount() ?? 0,
          ).toBe(waiting.length)
        }
      }
    } finally {
      for (const reader of readers) reader.controller.abort()
      client.clear()
    }
  })
})
