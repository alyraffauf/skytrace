import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PublicDataService, publicDataServiceFor } from '../src/data/publicData'
import { CACHE_TTL_MS } from '../src/lib/cache'
import { jsonResponse as response, repositoryRecord, createTestQueryClient, createTestService } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

describe('shared requests', () => {
  it('reuses identity and record reads until their TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const recordUri = `at://${did}/app.bsky.feed.post/3cached`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith('resolveMiniDoc')) {
        return response({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
      }
      return response(
        repositoryRecord(recordUri, {
          $type: 'app.bsky.feed.post',
          text: 'Cached',
          createdAt: '2026-01-01T00:00:00Z',
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const service = new PublicDataService(queryClient)

    await service.actors.identity('atproto.com')
    await service.actors.identity('atproto.com')
    await service.core.record(recordUri)
    await service.core.record(recordUri)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.setSystemTime(Date.now() + CACHE_TTL_MS.identity + 1)
    await service.actors.identity('atproto.com')
    await service.core.record(recordUri)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('shared request lifecycle', () => {
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
    const pending = createTestService().core.record(uri, controller.signal)
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
        return response(
          repositoryRecord(uri, {
            $type: 'app.bsky.feed.post',
            text: 'Fresh request',
            createdAt: '2026-01-01T00:00:00Z',
          }),
        )
      }),
    )

    const publicData = createTestService()
    const controller = new AbortController()
    const abandoned = publicData.core.record(uri, controller.signal)
    await vi.waitFor(() => expect(requests).toBe(1))
    controller.abort()
    const restarted = publicData.core.record(uri)

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

    const publicData = new PublicDataService(createTestQueryClient(), 20)
    await expect(publicData.core.record(uri)).rejects.toMatchObject({ name: 'TimeoutError' })
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
    const first = publicData.core.record(uri, firstController.signal)
    const second = publicData.core.record(uri, secondController.signal)
    await vi.waitFor(() => expect(finishRequest).toBeDefined())
    firstController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchSignal?.aborted).toBe(false)
    finishRequest?.(
      response(
        repositoryRecord(uri, {
          $type: 'app.bsky.feed.post',
          text: 'shared',
          createdAt: '2026-01-01T00:00:00Z',
        }),
      ),
    )
    await expect(second).resolves.toMatchObject({ uri })
  })
})

it.each([false, true])('shares identity hydration across services when all consumers leave: %s', async (abortBoth) => {
  const service = createTestService()
  const uri = `at://${did}/app.bsky.feed.post/shared-identity` as const
  const record = {
    ...repositoryRecord(uri, {
      $type: 'app.bsky.feed.post',
      text: 'Shared identity',
      createdAt: '2026-01-01T00:00:00Z',
    }),
    uri,
  }
  let fetchSignal: AbortSignal | undefined
  let finishRequest!: (result: Response) => void
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    fetchSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
    return new Promise<Response>((resolve, reject) => {
      finishRequest = resolve
      fetchSignal?.addEventListener('abort', () => reject(fetchSignal?.reason), { once: true })
    })
  })
  vi.stubGlobal('fetch', fetch)
  const postController = new AbortController()
  const identityController = new AbortController()
  const post = service.posts.loadFromRecord({ record, signal: postController.signal })
  const identity = service.actors.identity(did, identityController.signal)
  await vi.waitFor(() => expect(fetchSignal).toBeDefined())
  expect(fetch).toHaveBeenCalledOnce()

  postController.abort()
  await expect(post).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetchSignal?.aborted).toBe(false)
  if (abortBoth) {
    identityController.abort()
    await expect(identity).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchSignal?.aborted).toBe(true)
  } else {
    finishRequest(response({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' }))
    await expect(identity).resolves.toMatchObject({ did, handle: 'atproto.com' })
    await expect(service.posts.loadFromRecord({ record })).resolves.toMatchObject({
      kind: 'post',
      repositoryPds: 'https://pds.example',
    })
    expect(fetch).toHaveBeenCalledOnce()
  }
})
