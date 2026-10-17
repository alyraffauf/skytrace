import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import { createTestQueryClient, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

describe('list data', () => {
  it.each(['query', 'imperative'])('shares list block counts when %s starts first', async (first) => {
    const listUri = `at://${did}/app.bsky.graph.list/shared-count`
    const fetch = vi.fn(async () => response({ total: 7 }))
    vi.stubGlobal('fetch', fetch)
    const client = createTestQueryClient()
    const service = new PublicDataService(client)
    const query = () => client.fetchQuery(service.lists.listBlockCountQueryOptions(listUri))
    const imperative = () => service.lists.listBlockCount(listUri)

    const pending = first === 'query' ? [query(), imperative()] : [imperative(), query()]
    await expect(Promise.all(pending)).resolves.toEqual([7, 7])
    await expect(query()).resolves.toBe(7)
    await expect(imperative()).resolves.toBe(7)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('returns references before requesting a selected list membership', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3streamed`
    const memberDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
    const membershipUri = `at://${did}/app.bsky.graph.listitem/3member`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith('getBacklinks'))
        return response({ total: 1, records: [{ did, collection: 'app.bsky.graph.listitem', rkey: '3member' }] })
      return response(
        repositoryRecord(membershipUri, {
          $type: 'app.bsky.graph.listitem',
          subject: memberDid,
          list: listUri,
          createdAt: '2026-01-05T00:00:00Z',
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const service = new PublicDataService(queryClient)

    await expect(service.lists.listMembers(listUri)).resolves.toMatchObject({ items: [{ uri: membershipUri }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('subject')).toBe(listUri)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('limit')).toBe('24')
    await expect(
      queryClient.fetchQuery(service.lists.listMemberQueryOptions(listUri, membershipUri)),
    ).resolves.toMatchObject({
      kind: 'relationship',
      actor: { did: memberDid },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('calls a fetched but invalid list membership malformed', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3streamed`
    const membershipUri = `at://${did}/app.bsky.graph.listitem/3member`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(
          repositoryRecord(membershipUri, {
            $type: 'app.bsky.graph.listitem',
            subject: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
            list: `at://${did}/app.bsky.graph.list/3other`,
            createdAt: '2026-01-05T00:00:00Z',
          }),
        ),
      ),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    await expect(
      queryClient.fetchQuery(new PublicDataService(queryClient).lists.listMemberQueryOptions(listUri, membershipUri)),
    ).resolves.toMatchObject({ kind: 'unavailable', reason: 'This list membership is malformed.' })
  })
})
