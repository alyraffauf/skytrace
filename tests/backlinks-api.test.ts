import { describe, expect, it, vi } from 'vitest'
import { getBacklinks, getBacklinksCount } from '../src/data/api/backlinks'
import { jsonResponse as response } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

describe('backlinks api', () => {
  it('gets a block backlink count without loading backlink records', async () => {
    let requestedUrl: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input instanceof Request ? input.url : String(input))
        return response({ total: 3_000 })
      }),
    )

    await expect(getBacklinksCount({ subject: did, source: 'app.bsky.graph.block:subject' })).resolves.toBe(3_000)
    expect(requestedUrl?.pathname).toMatch(/blue\.microcosm\.links\.getBacklinksCount$/)
    expect(requestedUrl?.searchParams.get('subject')).toBe(did)
    expect(requestedUrl?.searchParams.get('source')).toBe('app.bsky.graph.block:subject')
    expect(requestedUrl?.searchParams.has('limit')).toBe(false)
  })

  it('rejects malformed backlink subjects before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getBacklinks({ subject: 'not a URI', source: 'app.bsky.graph.block:subject' })).rejects.toThrow(
      'invalid subject URI',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
