import { describe, expect, it } from 'vitest'
import { normalizeActorInput } from '../src/lib/actors/input'
import { did } from './actorFixtures'

describe('actor input normalization', () => {
  it.each([
    [' @ATPROTO.COM ', 'atproto.com'],
    ['https://bsky.app/profile/atproto.com', 'atproto.com'],
    ['https://www.mu.social/profile/atproto.com/post/3example', 'atproto.com'],
    [did, did],
  ])('normalizes %s', (input, expected) => expect(normalizeActorInput(input)).toBe(expected))

  it.each(['', 'not a handle', 'https://example.com/profile/atproto.com', 'https://bsky.app/search'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeActorInput(input)).toThrow()
    },
  )
})
