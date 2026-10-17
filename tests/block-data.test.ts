import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import { CACHE_TTL_MS } from '../src/data/runtime/cachePolicy'
import type { ActorIdentity } from '../src/types'
import { createTestQueryClient, createTestService, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

describe('block data', () => {
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
    await expect(service.blocks.blockedBy(did)).resolves.toEqual({ items: [], cursor: undefined })
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
      createTestService().blocks.actorBlocksActor({ blockerDid: blockingAccountDid, subjectDid: blockTargetDid }),
    ).resolves.toBe(true)
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]?.searchParams.get('subject')).toBe(blockTargetDid)
    expect(requestedUrls[0]?.searchParams.get('source')).toBe('app.bsky.graph.block:subject')
    expect(requestedUrls[0]?.searchParams.getAll('did')).toEqual([blockingAccountDid])
    expect(requestedUrls[0]?.searchParams.get('limit')).toBe('1')
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
    const reference = (await service.blocks.blockedBy(did)).items[0]
    expect(reference).toMatchObject({ kind: 'relationship', id: blockUri })
    if (!reference || reference.kind !== 'relationship') throw new Error('Expected a relationship reference.')

    await expect(queryClient.fetchQuery(service.blocks.blockedByRecordQueryOptions(reference, did))).resolves.toEqual({
      ...reference,
      createdAt: '2026-01-05T00:00:00Z',
    })
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

    const page = await service.blocks.blocking(identity)
    expect(page.items).toEqual([
      expect.objectContaining({ kind: 'relationship', actor: { kind: 'actorReference', did: blockedDid } }),
    ])
    await service.blocks.blocking(identity)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + CACHE_TTL_MS.activity + 1)
    await service.blocks.blocking(identity)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
