// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isModerationListPurpose, listPurposeLabel } from '../src/lib/lists'

describe('listPurposeLabel', () => {
  it.each([
    ['app.bsky.graph.defs#modlist', 'Moderation'],
    ['app.bsky.graph.defs#curatelist', 'Curation'],
    ['app.bsky.graph.defs#referencelist', 'Starter pack'],
  ])('labels the canonical purpose %s as %s', (purpose, expected) => {
    expect(listPurposeLabel(purpose)).toBe(expected)
  })

  it('does not let custom purposes claim the moderation label', () => {
    expect(listPurposeLabel('com.example.custom#modlist')).toBe('modlist')
    expect(listPurposeLabel('app.bsky.graph.defs.fake#modlist')).toBe('modlist')
  })

  it('falls back to the purpose suffix', () => {
    expect(listPurposeLabel('app.bsky.graph.defs#unknown')).toBe('unknown')
    expect(listPurposeLabel('nolist')).toBe('nolist')
  })
})

describe('isModerationListPurpose', () => {
  it('matches only the canonical moderation purpose', () => {
    expect(isModerationListPurpose('app.bsky.graph.defs#modlist')).toBe(true)
    expect(isModerationListPurpose('com.example.custom#modlist')).toBe(false)
  })
})
