import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostContent } from '../src/components/feed/PostContent'
import { LinkifiedText } from '../src/components/ui/LinkifiedText'
import { parseFacets } from '../src/data/posts/postParser'
import type { Facet } from '../src/types'
import { actorReference, did } from './actorFixtures'
import { renderWithRouter } from './profileTestUtils'

describe('plain text links', () => {
  it('keeps punctuation around multiple links and recognizes mixed-case URLs', () => {
    const text = 'Read (HTTPS://Example.COM/path), @atproto.com! Then example.org/docs.'
    const { container } = renderWithRouter(<LinkifiedText text={text} />)
    expect(screen.getByRole('link', { name: 'HTTPS://Example.COM/path' })).toHaveAttribute(
      'href',
      'https://example.com/path',
    )
    expect(screen.getByRole('link', { name: '@atproto.com' })).toHaveAttribute('href', '/profile/atproto.com')
    expect(screen.getByRole('link', { name: 'example.org/docs' })).toHaveAttribute('href', 'https://example.org/docs')
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(container.textContent).toBe(text)
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
            {
              index: { byteStart: 0, byteEnd: mention.length },
              features: [
                { $type: 'app.bsky.richtext.facet#mention', did },
                { $type: 'app.bsky.richtext.facet#link', uri: 'https://ignored.example' },
              ],
            },
            {
              index: { byteStart: urlStart, byteEnd: urlStart + url.length },
              features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
            },
            {
              index: { byteStart: unsafeStart, byteEnd: text.length },
              features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' }],
            },
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
    const { container } = renderWithRouter(
      <PostContent
        post={{
          kind: 'post',
          uri: `at://${did}/app.bsky.feed.post/unicode`,
          author: actorReference,
          createdAt: '2026-01-01T00:00:00Z',
          text,
          facets: parseFacets(text, [
            {
              index: { byteStart: start, byteEnd: end },
              features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
            },
          ]),
        }}
      />,
    )
    expect(container.textContent).toBe(text)
    expect(screen.getByRole('link', { name: '@alice.test' })).toHaveAttribute(
      'href',
      `/profile/${encodeURIComponent(did)}`,
    )
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
    expect(valid[0]?.features).toEqual([
      { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' },
      { $type: 'app.bsky.richtext.facet#tag', tag: 'weather' },
    ])
    expect(
      parseFacets(text, [
        { index: { byteStart: 1, byteEnd: 4 }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'broken' }] },
      ]),
    ).toEqual([])
  })
})

it('sorts facets and rejects overlapping, invalid, and unknown-only spans without changing text', () => {
  const text = '🌤 alpha beta #tag'
  const link = [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }] as const
  const facets: Facet[] = [
    { index: { byteStart: 11, byteEnd: 15 }, features: [...link] },
    { index: { byteStart: -1, byteEnd: 4 }, features: [...link] },
    { index: { byteStart: 5, byteEnd: 10 }, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] },
    { index: { byteStart: 5, byteEnd: 15 }, features: [...link] },
    { index: { byteStart: 8, byteEnd: 13 }, features: [...link] },
    { index: { byteStart: 1, byteEnd: 4 }, features: [...link] },
    { index: { byteStart: 15, byteEnd: 50 }, features: [...link] },
    { index: { byteStart: 15, byteEnd: 15 }, features: [...link] },
    {
      index: { byteStart: 0, byteEnd: 4 },
      features: [{ $type: 'app.bsky.richtext.facet#future' } as unknown as Facet['features'][number]],
    },
    { index: { byteStart: 16, byteEnd: 20 }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'tag' }] },
  ]
  const original = structuredClone(facets)
  const { container } = renderWithRouter(
    <PostContent
      post={{
        kind: 'post',
        uri: `at://${did}/app.bsky.feed.post/malformed-facets`,
        author: actorReference,
        createdAt: '2026-01-01T00:00:00Z',
        text,
        facets: parseFacets(text, facets),
      }}
    />,
  )
  expect(container.textContent).toBe(text)
  expect(screen.getAllByRole('link')).toHaveLength(2)
  expect(screen.getByRole('link', { name: 'alpha' })).toHaveAttribute('href', `/profile/${encodeURIComponent(did)}`)
  expect(screen.getByRole('link', { name: 'beta' })).toHaveAttribute('href', 'https://example.com/')
  expect(screen.queryByRole('link', { name: '#tag' })).not.toBeInTheDocument()
  expect(facets).toEqual(original)
})

it('uses the last mention and link features and checks the final link target', () => {
  const text = 'mention link unsafe'
  const { container } = renderWithRouter(
    <PostContent
      post={{
        kind: 'post',
        uri: `at://${did}/app.bsky.feed.post/repeated-features`,
        author: actorReference,
        createdAt: '2026-01-01T00:00:00Z',
        text,
        facets: parseFacets(text, [
          {
            index: { byteStart: 0, byteEnd: 7 },
            features: [
              { $type: 'app.bsky.richtext.facet#mention', did },
              { $type: 'app.bsky.richtext.facet#mention', did: 'did:web:example.com' },
            ],
          },
          {
            index: { byteStart: 8, byteEnd: 12 },
            features: [
              { $type: 'app.bsky.richtext.facet#link', uri: 'https://ignored.example' },
              { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' },
            ],
          },
          {
            index: { byteStart: 13, byteEnd: 19 },
            features: [
              { $type: 'app.bsky.richtext.facet#link', uri: 'https://ignored.example' },
              { $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' },
            ],
          },
        ]),
      }}
    />,
  )
  expect(container.textContent).toBe(text)
  expect(screen.getByRole('link', { name: 'mention' })).toHaveAttribute('href', '/profile/did%3Aweb%3Aexample.com')
  expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://example.com/')
  expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument()
})
