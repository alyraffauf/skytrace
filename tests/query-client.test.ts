import { afterEach, expect, it, vi } from 'vitest'
import { QueryObserver } from '@tanstack/react-query'
import { PublicDataService } from '../src/data/publicData'
import { queryClient } from '../src/data/runtime/queryClient'
import { jsonResponse } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

afterEach(() => queryClient.clear())

it('fails nested profile loading once and permits an explicit retry', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname.endsWith('resolveMiniDoc')) throw new TypeError('Failed to fetch')
    return jsonResponse({ error: 'NotFound' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  const service = new PublicDataService(queryClient)
  const observer = new QueryObserver(queryClient, service.profileVisibility.queryOptions(did))
  const unsubscribe = observer.subscribe(() => {})

  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'))
    expect(observer.getCurrentResult().error).toMatchObject({ message: 'Failed to fetch' })
    expect(fetchMock).toHaveBeenCalledOnce()

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return url.pathname.endsWith('resolveMiniDoc')
        ? jsonResponse({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
        : jsonResponse({ error: 'NotFound' }, 404)
    })

    await expect(observer.refetch({ throwOnError: true })).resolves.toMatchObject({
      data: { visible: true, profile: { identity: { did } } },
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  } finally {
    unsubscribe()
  }
})
