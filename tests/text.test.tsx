import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostContent, splitFacetedText } from '../src/components/feed/PostContent'
import { LinkifiedText } from '../src/components/ui/LinkifiedText'
import { parseFacets } from '../src/data/posts/postParser'
import { actorReference, did } from './actorFixtures'
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
  it('prefers mentions over external links and leaves unsafe targets as text', () => {
    const mention = '@alice.test'
    const url = 'https://example.com'
    const text = `${mention} ${url} unsafe`
    const urlStart = mention.length + 1
    const unsafeStart = urlStart + url.length + 1
    renderWithRouter(
      <PostContent
        post={{
          kind: 'post',
          uri: `at://${did}/app.bsky.feed.post/links`,
          author: actorReference,
          createdAt: '2026-01-01T00:00:00Z',
          text,
          facets: [
            { byteStart: 0, byteEnd: mention.length, mentionDid: did, href: 'https://ignored.example' },
            { byteStart: urlStart, byteEnd: urlStart + url.length, href: url },
            { byteStart: unsafeStart, byteEnd: text.length, href: 'javascript:alert(1)' },
          ],
        }}
      />,
    )
    expect(screen.getByRole('link', { name: mention })).toHaveAttribute('href', `/profile/${encodeURIComponent(did)}`)
    expect(screen.getByRole('link', { name: url })).toHaveAttribute('href', `${url}/`)
    expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument()
    expect(screen.getByText(/unsafe/)).toHaveTextContent(text)
  })

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
