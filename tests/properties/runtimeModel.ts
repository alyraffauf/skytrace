import { setImmediate } from 'node:timers/promises'

export const settle = () => setImmediate()

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export function observe<T>(promise: Promise<T>) {
  const result: { outcome: unknown } = { outcome: 'pending' }
  promise.then(
    (value) => (result.outcome = value),
    (error: unknown) => (result.outcome = error),
  )
  return result
}

export async function histories(
  name: string,
  run: (draw: (bound: number) => number, event: (label: string) => void) => Promise<void>,
) {
  const first = Number(process.env.RUNTIME_SEED ?? 1)
  const count = Number(process.env.RUNTIME_CASES ?? 48)
  const coverage: Record<string, number> = {}
  for (let seed = first; seed < first + count; seed++) {
    const trace: string[] = []
    let state = seed
    // Mulberry32; keep integer state independent of both the model and the implementation.
    function draw(bound: number) {
      state = (state + 0x6d2b79f5) | 0
      let bits = Math.imul(state ^ (state >>> 15), 1 | state)
      bits ^= bits + Math.imul(bits ^ (bits >>> 7), 61 | bits)
      return Math.floor((((bits ^ (bits >>> 14)) >>> 0) / 2 ** 32) * bound)
    }
    try {
      await run(draw, (label) => {
        trace.push(label)
        coverage[label] = 1 + (coverage[label] ?? 0)
      })
    } catch (cause) {
      throw new Error(`${name} seed=${seed} events=${trace.join(',')}`, { cause })
    }
  }
  if (process.env.RUNTIME_COVERAGE) console.info(name, JSON.stringify(coverage))
}
