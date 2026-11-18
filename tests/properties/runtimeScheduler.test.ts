// @vitest-environment node
import { expect, it } from 'vitest'
import { RequestScheduler } from '../../src/data/runtime/requestScheduler'
import { deferred, histories, observe, settle } from './runtimeModel'

it('dispatches the oldest eligible jobs within the limit and returns each job’s outcome', async () => {
  await histories('scheduler', async (draw, event) => {
    const limit = 1 + draw(4)
    const scheduler = new RequestScheduler(limit)
    const started: number[] = []
    const expectedStarts: number[] = []
    const jobs: {
      id: number
      gate: ReturnType<typeof deferred<number>>
      controller: AbortController
      observed: ReturnType<typeof observe>
      state: 'queued' | 'running' | 'done'
      outcome: unknown
    }[] = []

    for (let step = 0; step < 60 || jobs.some((job) => job.state !== 'done'); step++) {
      const action = step < 60 ? draw(10) : 9
      const open = jobs.filter((job) => job.state !== 'done')
      const running = jobs.filter((job) => job.state === 'running')
      if (step < 60 && (action < 5 || !open.length)) {
        const id = jobs.length
        const gate = deferred<number>()
        const controller = new AbortController()
        const observed = observe(
          scheduler.run(() => {
            started.push(id)
            return gate.promise
          }, controller.signal),
        )
        jobs.push({ id, gate, controller, observed, state: 'queued', outcome: 'pending' })
        event(running.length === limit ? 'enqueue' : 'admit')
      } else if (action < 7) {
        const job = open[draw(open.length)]
        const reason = new Error('caller left')
        job.controller.abort(reason)
        event('cancel-' + job.state)
        if (job.state === 'queued') {
          job.state = 'done'
          job.outcome = reason
        }
      } else {
        const job = running[draw(running.length)]
        job.state = 'done'
        if (action === 7) {
          const failure = new Error('transport failed')
          job.outcome = failure
          job.gate.reject(failure)
          event('fail')
        } else {
          job.outcome = job.id
          job.gate.resolve(job.id)
          event('finish')
        }
      }
      // Recompute eligibility from submission order, without queue mutation or a slot counter.
      const eligible = jobs.filter((job) => job.state !== 'done').slice(0, limit)
      for (const job of eligible.filter((candidate) => candidate.state === 'queued')) {
        job.state = 'running'
        expectedStarts.push(job.id)
      }
      await settle()
      expect(started).toEqual(expectedStarts)
      expect(jobs.map((job) => job.observed.outcome)).toEqual(jobs.map((job) => job.outcome))
    }
  })
})
