import { expect, it } from 'vitest'
import { newestFirst } from '../src/lib/sorting'

it('sorts dates without mutating input and preserves ties and undated item order', () => {
  const items = [
    { kind: 'unavailable', id: 'missing-first' },
    { kind: 'post', id: 'older', createdAt: '2026-01-01T00:00:00Z' },
    { kind: 'post', id: 'invalid', createdAt: 'invalid' },
    { kind: 'post', id: 'newer-first', createdAt: '2026-02-01T00:00:00Z' },
    { kind: 'unavailable', id: 'missing-last' },
    { kind: 'post', id: 'newer-second', createdAt: '2026-02-01T00:00:00Z' },
  ]
  const original = [...items]

  expect(newestFirst(items).map((item) => item.id)).toEqual([
    'newer-first',
    'newer-second',
    'older',
    'missing-first',
    'invalid',
    'missing-last',
  ])
  expect(items).toEqual(original)
})
