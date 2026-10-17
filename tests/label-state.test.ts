// @vitest-environment node
import { expect, it } from 'vitest'
import { labelState } from '../src/lib/labels/history'
import type { LabelEvent } from '../src/types'
import { did } from './actorFixtures'

it('expires labels at the supplied boundary while keeping removals final', () => {
  const label: LabelEvent = {
    kind: 'labelEvent',
    id: 'expiring',
    sourceDid: did,
    subject: did,
    value: 'test-label',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-02-01T00:00:00Z',
    negated: false,
  }
  const expiresAtMs = Date.parse(label.expiresAt!)
  expect(labelState(label, expiresAtMs - 1)).toBe('Active')
  expect(labelState(label, expiresAtMs)).toBe('Expired')
  expect(labelState({ ...label, negated: true }, expiresAtMs - 1)).toBe('Removed')
  expect(labelState({ ...label, negated: true }, expiresAtMs)).toBe('Removed')
})
