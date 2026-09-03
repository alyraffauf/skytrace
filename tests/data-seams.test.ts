import { describe, expect, it, vi } from 'vitest'
import { PublicDataService, publicDataServiceFor } from '../src/data/publicData'
import type { ActorIdentity } from '../src/types'
import { RequestScheduler } from '../src/lib/requestScheduler'
import { createTestQueryClient, createTestService, jsonResponse as response } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const memberDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

function service() {
  return createTestService()
}

describe('public data seams', () => {
  it('backfills account-label events directly from discovered labelers', async () => {
    const labelerDid = memberDid
    const signature = 'c2lnbmF0dXJl'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream') {
          expect(url.searchParams.get('limit')).toBe('250')
          return response({
            labels: [{ ver: 1, src: labelerDid, uri: did, val: 'newer', cts: '2026-08-01T00:00:00Z', sig: signature }],
          })
        }
        if (url.hostname === 'plc.directory') {
          return response({
            id: labelerDid,
            service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://labels.example' }],
          })
        }
        if (url.hostname === 'labels.example') {
          return response({
            labels: [{ ver: 1, src: labelerDid, uri: did, val: 'older', cts: '2025-01-01T00:00:00Z', sig: signature }],
          })
        }
        if (url.pathname.endsWith('resolveMiniDoc')) {
          return response({
            did: labelerDid,
            handle: 'labeler.example',
            pds: 'https://pds.example',
            signing_key: 'zQ3test',
          })
        }
        if (url.pathname.endsWith('getRecordByUri')) return response({ error: 'NotFound' }, 404)
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const publicData = service()
    const relayPage = await publicData.labels(did)
    expect(relayPage.items).toHaveLength(1)
    expect(relayPage.cursor).toMatchObject({ kind: 'labels', did })

    const directPage = await publicData.labels(did, relayPage.cursor)
    expect(directPage.items).toMatchObject([{ kind: 'labelEvent', value: 'older', createdAt: '2025-01-01T00:00:00Z' }])
    expect(directPage.cursor).toBeUndefined()
  })

  it('rejects a repeated repository cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ records: [], cursor: 'same' })),
    )
    await expect(service().blocking(identity, 'same')).rejects.toThrow('repeated a pagination cursor')
  })

  it('continues direct-provider pagination past 250 events and filters forged sources', async () => {
    const labelerDid = memberDid
    let providerPages = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream') {
          return response({
            labels: [{ ver: 1, src: labelerDid, uri: did, val: 'relay-copy', cts: '2026-08-01T00:00:00Z' }],
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
              labels: Array.from({ length: 250 }, (_, index) => ({
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
              { ver: 1, src: labelerDid, uri: did, val: 'label-250', cts: '2024-01-01T00:00:00Z' },
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

    const publicData = service()
    const relay = await publicData.labels(did)
    const firstDirect = await publicData.labels(did, relay.cursor)
    const secondDirect = await publicData.labels(did, firstDirect.cursor)
    expect(firstDirect.items).toHaveLength(250)
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
      if (url.hostname === 'labelers.firehose.stream') {
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

    const publicData = service()
    const relay = await publicData.labels(did)
    const direct = await publicData.labels(did, relay.cursor)
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
      if (url.hostname === 'labelers.firehose.stream') {
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

    const publicData = service()
    const relay = await publicData.labels(did)
    const fallback = await publicData.labels(did, relay.cursor)
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
        if (url.hostname === 'labelers.firehose.stream') {
          return response({
            labels: [{ ver: 1, src: labelerDid, uri: did, val: 'relay', cts: '2026-09-01T00:00:00Z' }],
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

    const publicData = service()
    const relay = await publicData.labels(did)
    const first = await publicData.labels(did, relay.cursor)
    const second = await publicData.labels(did, first.cursor)
    const repeated = await publicData.labels(did, second.cursor)
    expect(repeated.cursor).toBeUndefined()
  })

  it('keeps paging after a relay page contains only malformed events', async () => {
    let relayPages = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'labelers.firehose.stream') {
          relayPages += 1
          return relayPages === 1
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
    const publicData = service()
    const malformed = await publicData.labels(did)
    const recovered = await publicData.labels(did, malformed.cursor)
    expect(malformed.cursor).toBeDefined()
    expect(recovered.items).toContainEqual(expect.objectContaining({ kind: 'labelEvent', value: 'recovered' }))
  })

  it('aborts the fetch when the final consumer leaves shared work', async () => {
    const uri = `at://${did}/app.bsky.feed.post/abort`
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
        return new Promise<Response>((_resolve, reject) => {
          fetchSignal?.addEventListener('abort', () => reject(fetchSignal?.reason), { once: true })
        })
      }),
    )
    const controller = new AbortController()
    const pending = service().record(uri, controller.signal)
    await vi.waitFor(() => expect(fetchSignal).toBeDefined())
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('starts fresh work when a new consumer arrives after the final subscriber aborts', async () => {
    const uri = `at://${did}/app.bsky.feed.post/restarted`
    let requests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests += 1
        const signal = input instanceof Request ? input.signal : init?.signal
        if (requests === 1) {
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
        }
        return response({
          uri,
          cid,
          value: { $type: 'app.bsky.feed.post', text: 'Fresh request', createdAt: '2026-01-01T00:00:00Z' },
        })
      }),
    )

    const publicData = service()
    const controller = new AbortController()
    const abandoned = publicData.record(uri, controller.signal)
    await vi.waitFor(() => expect(requests).toBe(1))
    controller.abort()
    const restarted = publicData.record(uri)

    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })
    await expect(restarted).resolves.toMatchObject({ uri })
    expect(requests).toBe(2)
  })

  it('times out a primary request that never responds', async () => {
    const uri = `at://${did}/app.bsky.feed.post/timeout`
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
        return new Promise<Response>((_resolve, reject) => {
          fetchSignal?.addEventListener('abort', () => reject(fetchSignal?.reason), { once: true })
        })
      }),
    )

    const publicData = new PublicDataService(createTestQueryClient(), undefined, 20)
    await expect(publicData.record(uri)).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('keeps shared work alive while another consumer remains', async () => {
    const uri = `at://${did}/app.bsky.feed.post/shared`
    let fetchSignal: AbortSignal | undefined
    let finishRequest: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
        return new Promise<Response>((resolve, reject) => {
          finishRequest = resolve
          fetchSignal?.addEventListener('abort', () => reject(fetchSignal?.reason), { once: true })
        })
      }),
    )
    const queryClient = createTestQueryClient()
    const publicData = publicDataServiceFor(queryClient)
    expect(publicDataServiceFor(queryClient)).toBe(publicData)
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = publicData.record(uri, firstController.signal)
    const second = publicData.record(uri, secondController.signal)
    await vi.waitFor(() => expect(finishRequest).toBeDefined())
    firstController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchSignal?.aborted).toBe(false)
    finishRequest?.(
      response({ uri, cid, value: { $type: 'app.bsky.feed.post', text: 'shared', createdAt: '2026-01-01T00:00:00Z' } }),
    )
    await expect(second).resolves.toMatchObject({ uri })
  })
})

describe('request scheduling', () => {
  it('never starts more than six hydration operations', async () => {
    const scheduler = new RequestScheduler(6)
    let active = 0
    let maximum = 0
    await Promise.all(
      Array.from({ length: 18 }, (_, index) =>
        scheduler.run(async () => {
          active += 1
          maximum = Math.max(maximum, active)
          await new Promise((resolve) => setTimeout(resolve, 1))
          active -= 1
          return index
        }),
      ),
    )
    expect(maximum).toBe(6)
  })

  it('releases its slot when an operation throws before returning a promise', async () => {
    const scheduler = new RequestScheduler(1)
    const failed = scheduler.run(() => {
      throw new Error('Synchronous failure')
    })
    const next = scheduler.run(async () => 'next')

    await expect(failed).rejects.toThrow('Synchronous failure')
    await expect(next).resolves.toBe('next')
  })
})

describe('feed paging', () => {
  it('holds older reposts until newer posts from the next source page are emitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        const method = url.pathname.split('/').at(-1)
        if (method === 'com.atproto.repo.listRecords') {
          const collection = url.searchParams.get('collection')
          const cursor = url.searchParams.get('cursor')
          if (collection === 'app.bsky.feed.post') {
            const month = cursor ? '03' : '04'
            return response({
              records: Array.from({ length: 50 }, (_, index) => ({
                uri: `at://${did}/app.bsky.feed.post/${month}${String(index).padStart(2, '0')}`,
                cid,
                value: {
                  $type: collection,
                  text: month,
                  createdAt: `2026-${month}-01T00:${String(index).padStart(2, '0')}:00Z`,
                },
              })),
              ...(cursor ? {} : { cursor: 'posts-2' }),
            })
          }
          return response({
            records: Array.from({ length: 50 }, (_, index) => ({
              uri: `at://${did}/app.bsky.feed.repost/01${String(index).padStart(2, '0')}`,
              cid,
              value: {
                $type: collection,
                subject: { uri: `at://${memberDid}/app.bsky.feed.post/${index}`, cid },
                createdAt: `2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
              },
            })),
          })
        }
        if (method === 'blue.microcosm.identity.resolveMiniDoc') {
          const identifier = url.searchParams.get('identifier')
          return identifier === memberDid
            ? response({ did: memberDid, handle: 'member.example', pds: 'https://pds.example', signing_key: 'zQ3test' })
            : response({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
        }
        if (method === 'blue.microcosm.repo.getRecordByUri') {
          const uri = url.searchParams.get('at_uri') ?? ''
          return response({
            uri,
            cid,
            value: { $type: 'app.bsky.feed.post', text: 'Reposted target', createdAt: '2025-12-01T00:00:00Z' },
          })
        }
        return response({ error: 'UnknownRequest' }, 400)
      }),
    )

    const publicData = service()
    const emitted = []
    let cursor
    do {
      const page = await publicData.feed(identity, cursor)
      emitted.push(...page.items)
      cursor = page.cursor
    } while (emitted.length < 100 && cursor)
    expect(emitted).toHaveLength(108)
    expect(emitted.slice(0, 50).every((item) => item.kind === 'post' && item.createdAt.startsWith('2026-04'))).toBe(
      true,
    )
    expect(emitted.slice(50, 100).every((item) => item.kind === 'post' && item.createdAt.startsWith('2026-03'))).toBe(
      true,
    )
    expect(emitted.slice(100).every((item) => item.kind === 'repost' && item.target.kind === 'post')).toBe(true)
    const dates = emitted.map((item) =>
      item.kind === 'unavailable' ? Number.NEGATIVE_INFINITY : Date.parse(item.createdAt),
    )
    expect(dates.every((date, index) => index === 0 || dates[index - 1]! >= date)).toBe(true)
  })

  it('caps empty source advances when a PDS keeps changing cursors', async () => {
    let requests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        requests += 1
        return response({ records: [], cursor: `empty-${requests}` })
      }),
    )
    const page = await service().feed(identity)
    expect(page.items).toEqual([])
    expect(page.cursor).toBeDefined()
    expect(requests).toBeGreaterThan(0)
    expect(requests).toBeLessThanOrEqual(8)
  })

  it('keeps the empty-source cap for the whole emitted feed page', async () => {
    let requests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requests += 1
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.searchParams.get('collection') === 'app.bsky.feed.repost') {
          return response({ records: [], cursor: `empty-reposts-${requests}` })
        }
        return response({
          records: Array.from({ length: 12 }, (_, index) => ({
            uri: `at://${did}/app.bsky.feed.post/post-${index}`,
            cid,
            value: {
              $type: 'app.bsky.feed.post',
              text: `Post ${index}`,
              createdAt: `2026-01-01T00:${String(59 - index).padStart(2, '0')}:00Z`,
            },
          })),
        })
      }),
    )

    const page = await service().feed(identity)
    expect(page.items).toHaveLength(12)
    expect(requests).toBe(5)
    expect(page.cursor).toBeDefined()
  })
})
