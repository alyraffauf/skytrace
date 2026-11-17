// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import { createTestQueryClient, jsonResponse, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const profileUri = `at://${did}/app.bsky.actor.profile/self`

describe('XRPC client', () => {
  it('passes redirect refusal to fetch', async () => {
    let redirectPolicy: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (!url.pathname.endsWith('getRecordByUri')) return jsonResponse({ error: 'Unexpected' }, 500)
      redirectPolicy = init?.redirect
      return jsonResponse(repositoryRecord(profileUri, { $type: 'app.bsky.actor.profile' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new PublicDataService(createTestQueryClient())
    await expect(service.core.record(profileUri)).resolves.toBeDefined()
    expect(redirectPolicy).toBe('error')
  })

  it('rejects when a service responds with a redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:9/xrpc/x' } })),
    )

    const service = new PublicDataService(createTestQueryClient())
    await expect(service.core.record(profileUri)).rejects.toThrow()
  })
})
