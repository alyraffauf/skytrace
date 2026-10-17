import { describe, expect, it, vi } from 'vitest'
import { createTestService, jsonResponse as response } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const memberDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'

describe('label provider history', () => {
  it('backfills a relay-discovered provider when AppView has no labels', async () => {
    const label = { src: memberDid, uri: did, val: 'history', cts: '2026-01-01T00:00:00Z' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'labelers.firehose.stream') return response({ labels: [label] })
      if (url.hostname === 'public.api.bsky.app') return response({ labels: [] })
      if (url.hostname === 'plc.directory')
        return response({
          id: memberDid,
          service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://history.example' }],
        })
      if (url.hostname === 'history.example') return response({ labels: [label] })
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const service = createTestService()
    const first = await service.labelHistory.page(did)
    expect(first.items).toEqual([])
    expect(first.cursor?.providers).toMatchObject([{ did: memberDid }])
    const history = await service.labelHistory.page(did, first.cursor)
    expect(history.items).toMatchObject([{ value: 'history', sourceDid: memberDid }])
    expect(history.cursor).toBeUndefined()
  })

  it('saves discovery progress one page at a time and stops cursor cycles', async () => {
    const relayCursors: Array<string | null> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream') {
          const cursor = url.searchParams.get('cursor')
          relayCursors.push(cursor)
          return response({
            labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }],
            cursor: cursor === 'a' ? 'b' : 'a',
          })
        }
        if (url.hostname === 'public.api.bsky.app') {
          expect(url.searchParams.getAll('sources')).toContain(memberDid)
          return response({ labels: [] })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const service = createTestService()
    const first = await service.labelHistory.page(did)
    expect(relayCursors).toEqual([null])
    const snapshot = structuredClone(first.cursor)
    const second = await service.labelHistory.page(did, first.cursor)
    expect(first.cursor).toEqual(snapshot)
    expect(relayCursors).toEqual([null, 'a'])
    const third = await service.labelHistory.page(did, second.cursor)
    expect(relayCursors).toEqual([null, 'a', 'b'])
    expect(third.cursor?.discoveryDone).toBe(true)
    expect(third.cursor?.appViewSources).toContain(memberDid)
    expect(third.items).toEqual([])
  })

  it('reuses cached discovery when retrying an AppView failure', async () => {
    let relayRequests = 0
    let appViewRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream') {
          relayRequests += 1
          return response({
            labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }],
          })
        }
        if (url.hostname === 'public.api.bsky.app') {
          appViewRequests += 1
          if (appViewRequests === 1) return response({ error: 'Unavailable' }, 503)
          return response({ labels: [] })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const service = createTestService()
    await expect(service.labelHistory.page(did)).rejects.toThrow()
    const retry = await service.labelHistory.page(did)
    expect(relayRequests).toBe(1)
    expect(retry.cursor?.providers).toMatchObject([{ did: memberDid }])
  })

  it.each([
    ['a', 'a'],
    ['a', 'b', 'a'],
  ])('retains appView cycle pages and backfills providers: %j', async (...cursors) => {
    let appViewPages = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream')
          return response({
            labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }],
          })
        if (
          url.hostname === 'public.api.bsky.app' &&
          url.searchParams.get('sources') === 'did:plc:ar7c4by46qjdydhdevvrndac'
        ) {
          const index = appViewPages++
          return response({
            labels: [{ ver: 1, src: memberDid, uri: did, val: `appView-${index}`, cts: '2026-08-01T00:00:00Z' }],
            cursor: cursors[index],
          })
        }
        if (url.hostname === 'plc.directory')
          return response({
            id: memberDid,
            service: [
              { id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://cycle-labels.example' },
            ],
          })
        if (url.hostname === 'cycle-labels.example')
          return response({
            labels: [{ ver: 1, src: memberDid, uri: did, val: 'backfill', cts: '2025-01-01T00:00:00Z' }],
          })
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const service = createTestService()
    let page = await service.labelHistory.page(did)
    for (let index = 1; index < cursors.length; index++) {
      page = await service.labelHistory.page(did, page.cursor)
      expect(page.items).toMatchObject([{ value: `appView-${index}` }])
      expect(page.issues).toBeUndefined()
    }
    const backfill = await service.labelHistory.page(did, page.cursor)
    expect(backfill.items).toMatchObject([{ value: 'backfill' }])
    expect(backfill.cursor).toBeUndefined()
    expect(appViewPages).toBe(cursors.length)
  })

  it('continues direct-provider pagination and filters forged sources', async () => {
    const labelerDid = memberDid
    let providerPages = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream')
          return response({
            labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }],
          })
        if (
          url.hostname === 'public.api.bsky.app' &&
          url.searchParams.get('sources') === 'did:plc:ar7c4by46qjdydhdevvrndac'
        ) {
          return response({
            labels: [{ ver: 1, src: labelerDid, uri: did, val: 'appView-copy', cts: '2026-08-01T00:00:00Z' }],
          })
        }
        if (url.hostname === 'plc.directory') {
          return response({
            id: labelerDid,
            service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://labels.example' }],
          })
        }
        if (url.hostname === 'labels.example') {
          providerPages += 1
          if (providerPages === 1) {
            return response({
              labels: Array.from({ length: 2 }, (_, index) => ({
                ver: 1,
                src: labelerDid,
                uri: did,
                val: `label-${index}`,
                cts: `2025-01-01T00:${String(index % 60).padStart(2, '0')}:00Z`,
              })),
              cursor: 'provider-2',
            })
          }
          return response({
            labels: [
              { ver: 1, src: labelerDid, uri: did, val: 'older-label', cts: '2024-01-01T00:00:00Z' },
              { ver: 1, src: did, uri: did, val: 'forged-source', cts: '2024-01-01T00:00:00Z' },
            ],
          })
        }
        if (url.pathname.endsWith('resolveMiniDoc'))
          return response({
            did: labelerDid,
            handle: 'labeler.example',
            pds: 'https://pds.example',
            signing_key: 'zQ3test',
          })
        if (url.pathname.endsWith('getRecordByUri')) return response({ error: 'NotFound' }, 404)
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const publicData = createTestService()
    const appView = await publicData.labelHistory.page(did)
    const savedCursor = structuredClone(appView.cursor)
    await expect(publicData.labelHistory.page(memberDid, appView.cursor)).rejects.toThrow('belongs to another query')
    const firstDirect = await publicData.labelHistory.page(did, appView.cursor)
    expect(appView.cursor).toEqual(savedCursor)
    const secondDirect = await publicData.labelHistory.page(did, firstDirect.cursor)
    expect(firstDirect.items).toHaveLength(2)
    expect(secondDirect.items).toHaveLength(1)
    expect(secondDirect.items).not.toContainEqual(expect.objectContaining({ value: 'forged-source' }))
    expect(secondDirect.cursor).toBeUndefined()
    expect(providerPages).toBe(2)
  })

  it('continues to current providers when an earlier labeler is unavailable', async () => {
    const failedDid = memberDid
    const currentDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'labelers.firehose.stream')
        return response({ labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }] })
      if (
        url.hostname === 'public.api.bsky.app' &&
        url.searchParams.get('sources') === 'did:plc:ar7c4by46qjdydhdevvrndac'
      ) {
        return response({
          labels: [
            { ver: 1, src: failedDid, uri: did, val: 'stale', cts: '2026-09-02T00:00:00Z' },
            { ver: 1, src: currentDid, uri: did, val: 'renewed', cts: '2026-09-01T00:00:00Z' },
          ],
        })
      }
      if (url.hostname === 'plc.directory') {
        const sourceDid = decodeURIComponent(url.pathname.slice(1))
        return response({
          id: sourceDid,
          service: [
            {
              id: '#atproto_labeler',
              type: 'AtprotoLabeler',
              serviceEndpoint: sourceDid === failedDid ? 'https://failed.example' : 'https://current.example',
            },
          ],
        })
      }
      if (url.hostname === 'failed.example') return response({ error: 'Unavailable' }, 503)
      if (url.hostname === 'current.example') {
        return response({
          labels: [{ ver: 1, src: currentDid, uri: did, val: 'renewed', cts: '2026-09-03T00:00:00Z' }],
        })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const publicData = createTestService()
    const appView = await publicData.labelHistory.page(did)
    const direct = await publicData.labelHistory.page(did, appView.cursor)
    const requestedHosts = fetchMock.mock.calls.map(
      ([input]) => new URL(input instanceof Request ? input.url : String(input)).hostname,
    )
    expect(requestedHosts).toContain('failed.example')
    expect(requestedHosts).toContain('current.example')
    expect(direct.items).toContainEqual(
      expect.objectContaining({ sourceDid: currentDid, value: 'renewed', createdAt: '2026-09-03T00:00:00Z' }),
    )
  })

  it('falls back to AppView when the browser cannot read a direct labeler', async () => {
    const labelerDid = memberDid
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'labelers.firehose.stream')
        return response({ labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }] })
      if (
        url.hostname === 'public.api.bsky.app' &&
        url.searchParams.get('sources') === 'did:plc:ar7c4by46qjdydhdevvrndac'
      ) {
        return response({
          labels: [{ ver: 1, src: labelerDid, uri: did, val: 'renewed', cts: '2026-09-01T00:00:00Z' }],
        })
      }
      if (url.hostname === 'plc.directory') {
        return response({
          id: labelerDid,
          service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://no-cors.example' }],
        })
      }
      if (url.hostname === 'no-cors.example') throw new TypeError('Failed to fetch')
      if (url.hostname === 'public.api.bsky.app') {
        expect(url.searchParams.get('sources')).toBe(labelerDid)
        return response({
          labels: [
            { ver: 1, src: labelerDid, uri: did, val: 'renewed', cts: '2026-09-03T00:00:00Z' },
            { ver: 1, src: did, uri: did, val: 'wrong-source', cts: '2026-09-03T00:00:00Z' },
          ],
        })
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const publicData = createTestService()
    const appView = await publicData.labelHistory.page(did)
    const fallback = await publicData.labelHistory.page(did, appView.cursor)
    expect(fallback.items).toEqual([
      expect.objectContaining({ sourceDid: labelerDid, value: 'renewed', createdAt: '2026-09-03T00:00:00Z' }),
    ])
    const requestedHosts = fetchMock.mock.calls.map(
      ([input]) => new URL(input instanceof Request ? input.url : String(input)).hostname,
    )
    expect(requestedHosts).toContain('no-cors.example')
    expect(requestedHosts).toContain('public.api.bsky.app')
  })

  it('stops a direct provider whose cursors form a cycle', async () => {
    const labelerDid = memberDid
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream')
          return response({
            labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }],
          })
        if (
          url.hostname === 'public.api.bsky.app' &&
          url.searchParams.get('sources') === 'did:plc:ar7c4by46qjdydhdevvrndac'
        ) {
          return response({
            labels: [{ ver: 1, src: labelerDid, uri: did, val: 'appView', cts: '2026-09-01T00:00:00Z' }],
          })
        }
        if (url.hostname === 'plc.directory') {
          return response({
            id: labelerDid,
            service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://labels.example' }],
          })
        }
        if (url.hostname === 'labels.example') {
          const cursor = url.searchParams.get('cursor')
          return response({
            labels: [
              { ver: 1, src: labelerDid, uri: did, val: `page-${cursor ?? 'first'}`, cts: '2026-09-02T00:00:00Z' },
            ],
            cursor: cursor === 'second' ? 'first' : cursor === 'first' ? 'second' : 'first',
          })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const publicData = createTestService()
    const appView = await publicData.labelHistory.page(did)
    const first = await publicData.labelHistory.page(did, appView.cursor)
    const second = await publicData.labelHistory.page(did, first.cursor)
    const repeated = await publicData.labelHistory.page(did, second.cursor)
    expect(repeated.cursor).toBeUndefined()
  })

  it('keeps paging after an AppView page contains only malformed events', async () => {
    let appViewPages = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream')
          return response({
            labels: [{ src: memberDid, uri: did, val: 'discovery-only', cts: '2026-01-01T00:00:00Z' }],
          })
        if (
          url.hostname === 'public.api.bsky.app' &&
          url.searchParams.get('sources') === 'did:plc:ar7c4by46qjdydhdevvrndac'
        ) {
          appViewPages += 1
          return appViewPages === 1
            ? response({ labels: [{ malformed: true }], cursor: 'next' })
            : response({
                labels: [{ ver: 1, src: memberDid, uri: did, val: 'recovered', cts: '2026-01-01T00:00:00Z' }],
              })
        }
        if (url.pathname.endsWith('resolveMiniDoc'))
          return response({
            did: memberDid,
            handle: 'member.example',
            pds: 'https://pds.example',
            signing_key: 'zQ3test',
          })
        if (url.pathname.endsWith('getRecordByUri')) return response({ error: 'NotFound' }, 404)
        return response({ id: memberDid })
      }),
    )
    const publicData = createTestService()
    const malformed = await publicData.labelHistory.page(did)
    const recovered = await publicData.labelHistory.page(did, malformed.cursor)
    expect(malformed.cursor).toBeDefined()
    expect(recovered.items).toContainEqual(expect.objectContaining({ kind: 'labelEvent', value: 'recovered' }))
  })
})
