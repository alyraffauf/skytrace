import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { splitFacetedText } from '../src/components/feed/PostContent'
import { LinkifiedText } from '../src/components/ui/LinkifiedText'
import { parseFacets } from '../src/data/recordParsers'
import { did } from './actorFixtures'
import { renderWithRouter } from './profileTestUtils'

describe('plain text links', () => {
  it('links handles, bare domains, and full URLs', () => {
    renderWithRouter(<LinkifiedText text="@atproto.com docs at atproto.com and https://example.com/read" />)
    expect(screen.getByRole('link', { name: '@atproto.com' })).toHaveAttribute('href', '/profile/atproto.com')
    expect(screen.getByRole('link', { name: 'atproto.com' })).toHaveAttribute('href', 'https://atproto.com/')
    expect(screen.getByRole('link', { name: 'https://example.com/read' })).toHaveAttribute(
      'href',
      'https://example.com/read',
    )
  })
})

describe('UTF-8 facets', () => {
  it('uses byte offsets without splitting multibyte characters', () => {
    const text = 'Hi 🌤️ @alice.test'
    const start = new TextEncoder().encode('Hi 🌤️ ').length
    const end = new TextEncoder().encode(text).length
    expect(splitFacetedText(text, [{ byteStart: start, byteEnd: end, mentionDid: did }])).toEqual([
      { text: 'Hi 🌤️ ' },
      { text: '@alice.test', facet: { byteStart: start, byteEnd: end, mentionDid: did } },
    ])
  })

  it('keeps every recognized feature and rejects spans inside a UTF-8 character', () => {
    const text = '🌤 link'
    const valid = parseFacets(text, [
      {
        index: { byteStart: 5, byteEnd: 9 },
        features: [
          { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' },
          { $type: 'app.bsky.richtext.facet#tag', tag: 'weather' },
        ],
      },
    ])
    expect(valid).toEqual([{ byteStart: 5, byteEnd: 9, href: 'https://example.com', tag: 'weather' }])
    expect(
      parseFacets(text, [
        { index: { byteStart: 1, byteEnd: 4 }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'broken' }] },
      ]),
    ).toEqual([])
  })
})
