// @vitest-environment node
import { expect, it } from 'vitest'
import { groupLabelHistory } from '../src/lib/labels/history'
import type { LabelEvent, UnavailableItem } from '../src/types'
import { did } from './actorFixtures'

const application: LabelEvent = {
  kind: 'labelEvent',
  id: 'first-application',
  sourceDid: did,
  subject: did,
  value: 'test-label',
  createdAt: '2026-01-01T00:00:00Z',
  negated: false,
}

it('pairs separate removal cycles and suppresses older repeated applications', () => {
  const renewal = { ...application, id: 'renewal', createdAt: '2026-01-02T00:00:00Z' }
  const firstRemoval = { ...application, id: 'first-removal', createdAt: '2026-01-03T00:00:00Z', negated: true }
  const reapplied = { ...application, id: 'reapplied', createdAt: '2026-01-04T00:00:00Z' }
  const secondRemoval = { ...firstRemoval, id: 'second-removal', createdAt: '2026-01-05T00:00:00Z' }
  const input = [application, secondRemoval, renewal, firstRemoval, reapplied]
  const snapshot = structuredClone(input)
  expect(groupLabelHistory(input)).toEqual([
    { ...secondRemoval, addedAt: reapplied.createdAt, expiresAt: undefined },
    { ...firstRemoval, addedAt: renewal.createdAt, expiresAt: undefined },
  ])
  expect(input).toEqual(snapshot)
})

it('retains unmatched removals, breaks timestamp ties by ID, and keeps unavailable rows last', () => {
  const firstRemoval = { ...application, id: 'a-removal', negated: true }
  const secondRemoval = { ...firstRemoval, id: 'b-removal' }
  const unavailable: UnavailableItem = { kind: 'unavailable', id: 'missing', reason: 'Unavailable' }
  expect(groupLabelHistory([unavailable, secondRemoval, firstRemoval])).toEqual([
    firstRemoval,
    secondRemoval,
    unavailable,
  ])
})
