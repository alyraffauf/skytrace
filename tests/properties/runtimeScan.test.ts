// @vitest-environment node
import { expect, it } from 'vitest'
import { runCancellableScan, type ScanScope } from '../../src/data/runtime/scanCancellation'
import { deferred, histories, observe, settle } from './runtimeModel'

it('returns the first stop cause across sibling failure, caller cancellation, and scan settlement', async () => {
  await histories('scan', async (draw, event) => {
    const caller = new AbortController()
    const gate = deferred<number>()
    const stops: Error[] = []
    let scope: ScanScope | undefined
    if (draw(5) === 0) {
      caller.abort(new Error('cancelled before entry'))
      stops.push(caller.signal.reason)
      event('pre-abort')
    }
    const result = observe(
      runCancellableScan(caller.signal, (current) => {
        scope = current
        return gate.promise
      }),
    )
    expect(Boolean(scope)).toBe(stops.length === 0)
    const count = draw(6)
    for (let index = 0; index < count; index++) {
      const failure = new Error('cause ' + index)
      if (draw(2)) {
        event('caller-abort')
        caller.abort(failure)
      } else {
        event('sibling-stop')
        scope?.stop(failure)
      }
      stops.push(failure)
      if (scope) expect(scope.signal.reason).toBe(stops[0])
    }
    const fails = draw(2) === 0
    const outcome = fails ? new Error('transport') : 42
    if (fails) gate.reject(outcome)
    else gate.resolve(42)
    // A pre-cancelled scan never consumes its gate.
    await gate.promise.catch(() => {})
    await settle()
    event(fails ? 'fail' : 'finish')
    expect(result.outcome).toBe(stops[0] ?? outcome)
    if (scope && stops.length === 0) {
      caller.abort()
      expect(scope.signal.aborted).toBe(false)
    }
  })
})
