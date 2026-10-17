import { afterEach, expect, it, vi } from 'vitest'
import { ClientResponseError } from '@atcute/client'
import { PublicDataService } from '../src/data/publicData'
import { queryClient } from '../src/data/runtime/queryClient'
import { jsonResponse } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

afterEach(() => queryClient.clear())

it.each([
  ['network failure', new TypeError('Failed to fetch')],
  ['rate limit', new ClientResponseError({ status: 429, data: { error: 'RateLimitExceeded' } })],
  ['server failure', new ClientResponseError({ status: 503, data: { error: 'Unavailable' } })],
])('does not retry a %s with production query defaults', async (_name, error) => {
  const load = vi.fn(async () => {
    throw error
  })

  await expect(queryClient.fetchQuery({ queryKey: ['single-attempt'], queryFn: load })).rejects.toBe(error)

  expect(load).toHaveBeenCalledOnce()
})

it('fails nested profile loading once and permits an explicit retry', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname.endsWith('resolveMiniDoc')) throw new TypeError('Failed to fetch')
    return jsonResponse({ error: 'NotFound' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  const service = new PublicDataService(queryClient)
  const options = service.profileVisibility.queryOptions(did)

  await expect(queryClient.fetchQuery(options)).rejects.toThrow('Failed to fetch')
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(
    queryClient
      .getQueryCache()
      .getAll()
      .every((query) => query.getObserversCount() === 0),
  ).toBe(true)

  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return url.pathname.endsWith('resolveMiniDoc')
      ? jsonResponse({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
      : jsonResponse({ error: 'NotFound' }, 404)
  })

  await expect(queryClient.fetchQuery(options)).resolves.toMatchObject({
    visible: true,
    profile: { identity: { did } },
  })
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(
    queryClient
      .getQueryCache()
      .getAll()
      .every((query) => query.getObserversCount() === 0),
  ).toBe(true)
})
