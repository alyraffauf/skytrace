import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import { getBacklinks, getBacklinksCount } from '../src/data/api/backlinks'
import { CACHE_TTL_MS } from '../src/data/runtime/cachePolicy'
import type { ActorIdentity } from '../src/types'
import { createTestQueryClient, createTestService, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

describe('graph data', () => {
  it('requests the newest Constellation backlinks first', async () => {
    let requestedUrl: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input instanceof Request ? input.url : String(input))
        return response({ total: 0, records: [] })
      }),
    )

    const service = createTestService()
    await expect(service.graph.blockedBy(did)).resolves.toEqual({ items: [], cursor: undefined })
    expect(requestedUrl?.searchParams.get('reverse')).toBe('false')
    expect(requestedUrl?.searchParams.get('limit')).toBe('24')
  })

  it('checks whether an account blocks the configured account with a filtered backlink query', async () => {
    const blockingAccountDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const blockTargetDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const requestedUrls: URL[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        requestedUrls.push(url)
        const requestedBlockingDid = url.searchParams.get('did')
        return response({
          total: requestedBlockingDid === blockingAccountDid ? 1 : 0,
          records:
            requestedBlockingDid === blockingAccountDid
              ? [{ did: blockingAccountDid, collection: 'app.bsky.graph.block', rkey: '3example' }]
              : [],
          cursor: null,
        })
      }),
    )

    await expect(
      createTestService().graph.actorBlocksConfiguredAccount(blockingAccountDid, blockTargetDid),
    ).resolves.toBe(true)
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]?.searchParams.get('subject')).toBe(blockTargetDid)
    expect(requestedUrls[0]?.searchParams.get('source')).toBe('app.bsky.graph.block:subject')
    expect(requestedUrls[0]?.searchParams.getAll('did')).toEqual([blockingAccountDid])
    expect(requestedUrls[0]?.searchParams.get('limit')).toBe('1')
  })

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

  it('keeps a successful relationship count when the other source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          return response({ error: 'Unavailable' }, 503)
        }
        if (url.pathname.endsWith('getBacklinksCount')) {
          return response({ total: 12 })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const service = new PublicDataService(queryClient)
    const [blocked, blockedBy] = await Promise.allSettled([
      queryClient.fetchQuery(service.graph.blockedCountQueryOptions(identity)),
      queryClient.fetchQuery(service.graph.blockedByCountQueryOptions(did)),
    ])

    expect(blocked.status).toBe('rejected')
    expect(blockedBy).toEqual({ status: 'fulfilled', value: 12 })
  })

  it('rejects malformed backlink subjects before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getBacklinks({ subject: 'not a URI', source: 'app.bsky.graph.block:subject' })).rejects.toThrow(
      'invalid subject URI',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies a backlink block record before returning its details', async () => {
    const blockerDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
    const blockUri = `at://${blockerDid}/app.bsky.graph.block/3verified`
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname.endsWith('getBacklinks')) {
          return response({
            total: 1,
            records: [{ did: blockerDid, collection: 'app.bsky.graph.block', rkey: '3verified' }],
          })
        }
        return response(
          repositoryRecord(blockUri, {
            $type: 'app.bsky.graph.block',
            subject: did,
            createdAt: '2026-01-05T00:00:00Z',
          }),
        )
      }),
    )
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    const reference = (await service.graph.blockedBy(did)).items[0]
    expect(reference).toMatchObject({ kind: 'relationship', id: blockUri })
    if (!reference || reference.kind !== 'relationship') throw new Error('Expected a relationship reference.')

    await expect(queryClient.fetchQuery(service.graph.blockedByRecordQueryOptions(reference, did))).resolves.toEqual({
      ...reference,
      createdAt: '2026-01-05T00:00:00Z',
    })
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

    await expect(service.graph.listMembers(listUri)).resolves.toMatchObject({ items: [{ uri: membershipUri }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('subject')).toBe(listUri)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('limit')).toBe('24')
    await expect(
      queryClient.fetchQuery(service.graph.listMemberQueryOptions(listUri, membershipUri)),
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
      queryClient.fetchQuery(new PublicDataService(queryClient).graph.listMemberQueryOptions(listUri, membershipUri)),
    ).resolves.toMatchObject({ kind: 'unavailable', reason: 'This list membership is malformed.' })
  })

  it('caches relationship pages without fetching actor profiles', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const blockedDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'pds.example') {
        return response({
          records: [
            repositoryRecord(`at://${did}/app.bsky.graph.block/cached`, {
              $type: 'app.bsky.graph.block',
              subject: blockedDid,
              createdAt: '2026-01-01T00:00:00Z',
            }),
          ],
        })
      }
      throw new Error(`Unexpected profile request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const service = createTestService()

    const page = await service.graph.blocking(identity)
    expect(page.items).toEqual([
      expect.objectContaining({ kind: 'relationship', actor: { kind: 'actorReference', did: blockedDid } }),
    ])
    await service.graph.blocking(identity)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + CACHE_TTL_MS.activity + 1)
    await service.graph.blocking(identity)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
