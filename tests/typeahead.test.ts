import { describe, expect, it, vi } from 'vitest'
import { parsePlcAccountDetails, searchActorsTypeahead } from '../src/data/xrpc'
import { jsonResponse as response } from './testUtils'

describe('actor typeahead', () => {
  it('queries typeahead.waow.tech and returns compact actor suggestions', async () => {
    let requestedUrl = ''
    let requestHeaders = new Headers()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input)
      requestHeaders = new Headers(init?.headers)
      return response({
        actors: [
          {
            did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz',
            handle: 'atproto.com',
            displayName: 'AT Protocol Developers',
            avatar: 'https://cdn.bsky.app/avatar.jpg',
            labels: [],
          },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchActorsTypeahead('@atp')).resolves.toEqual([
      {
        did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz',
        handle: 'atproto.com',
        displayName: 'AT Protocol Developers',
        avatar: 'https://cdn.bsky.app/avatar.jpg',
      },
    ])

    const requestUrl = new URL(requestedUrl)
    expect(requestUrl.origin).toBe('https://typeahead.waow.tech')
    expect(requestUrl.pathname).toBe('/xrpc/app.bsky.actor.searchActorsTypeahead')
    expect(requestUrl.searchParams.get('q')).toBe('atp')
    expect(requestUrl.searchParams.get('limit')).toBe('8')
    expect(requestHeaders.get('X-Client')).toBe('skytrace')
  })
})

describe('PLC account details', () => {
  it('extracts creation, current aliases, and distinct former handles', () => {
    expect(
      parsePlcAccountDetails([
        { createdAt: '2024-01-01T00:00:00Z', operation: { type: 'create', handle: 'first.example' } },
        { createdAt: '2024-02-01T00:00:00Z', operation: { alsoKnownAs: ['at://second.example'] } },
        {
          createdAt: '2024-03-01T00:00:00Z',
          operation: { alsoKnownAs: ['at://current.example', 'https://example.com/about'] },
        },
        { createdAt: '2024-04-01T00:00:00Z', nullified: true, operation: { alsoKnownAs: ['at://invalid.example'] } },
      ]),
    ).toEqual({
      createdAt: '2024-01-01T00:00:00Z',
      aliases: ['at://current.example', 'https://example.com/about'],
      formerHandles: ['first.example', 'second.example'],
    })
  })
})
