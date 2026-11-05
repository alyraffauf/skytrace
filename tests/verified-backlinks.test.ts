import { describe, expect, it, vi } from 'vitest'
import { createTestQueryClient, jsonResponse, repositoryRecord } from './testUtils'
import { PublicDataService } from '../src/data/publicData'
import { queryOptions } from '@tanstack/react-query'
import { countVerifiedBacklinkPublishers } from '../src/data/graph/verifiedBacklinks'
import { PublicDataValidationError } from '../src/data/validationError'

const firstDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const secondDid = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
const targetDid = 'did:plc:cccccccccccccccccccccccc'
const otherDid = 'did:plc:dddddddddddddddddddddddd'
const createdAt = '2026-01-01T00:00:00Z'

function verifiedBlockCountQueryOptions(service: PublicDataService) {
  return queryOptions({
    queryKey: ['verifiedBlockCount', targetDid] as const,
    queryFn: ({ signal }) =>
      countVerifiedBacklinkPublishers(service.core, { subject: targetDid, collection: 'app.bsky.graph.block' }, signal),
  })
}

describe.each(['app.bsky.graph.block', 'app.bsky.graph.listblock'] as const)('%s verification', (collection) => {
  const subject = collection === 'app.bsky.graph.block' ? targetDid : `at://${targetDid}/app.bsky.graph.list/test`

  function countQueryOptions(service: PublicDataService) {
    return collection === 'app.bsky.graph.block'
      ? verifiedBlockCountQueryOptions(service)
      : service.lists.listBlockCountQueryOptions(subject)
  }

  function executeCount(client: ReturnType<typeof createTestQueryClient>, service: PublicDataService) {
    return collection === 'app.bsky.graph.block'
      ? client.query(verifiedBlockCountQueryOptions(service))
      : client.query(service.lists.listBlockCountQueryOptions(subject))
  }

  it('counts unique verified publishers across all pages, not the index total or duplicate records', async () => {
    const references = [
      { did: firstDid, collection, rkey: 'valid' },
      { did: firstDid, collection, rkey: 'duplicate-account' },
      { did: otherDid, collection, rkey: 'wrong-subject' },
      { did: 'did:plc:eeeeeeeeeeeeeeeeeeeeeeee', collection: 'app.bsky.feed.post', rkey: 'wrong-collection' },
      { did: 'did:plc:ffffffffffffffffffffffff', collection, rkey: 'wrong-type' },
      { did: 'did:plc:gggggggggggggggggggggggg', collection, rkey: 'deleted' },
      { did: secondDid, collection, rkey: 'valid' },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('getBacklinks')) {
        const later = url.searchParams.has('cursor')
        return jsonResponse({
          total: 999,
          records: later ? references.slice(1) : [references[0]],
          cursor: later ? undefined : 'next',
        })
      }
      const uri = url.searchParams.get('at_uri')!
      if (uri.endsWith('/deleted')) return jsonResponse({ error: 'RecordNotFound' }, 400)
      const record = repositoryRecord(uri, {
        $type: uri.endsWith('/wrong-type') ? 'app.bsky.graph.listitem' : collection,
        subject: uri.endsWith('/wrong-subject')
          ? collection === 'app.bsky.graph.block'
            ? otherDid
            : `at://${otherDid}/app.bsky.graph.list/other`
          : subject,
        createdAt,
      })
      return jsonResponse(record)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()
    expect(await executeCount(client, new PublicDataService(client))).toBe(2)
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)))
    expect(urls.filter((url) => url.pathname.endsWith('getBacklinks'))).toHaveLength(2)
    expect(urls.some((url) => url.searchParams.get('at_uri')?.endsWith('/wrong-collection'))).toBe(false)
    expect(urls.some((url) => url.pathname.endsWith('getBacklinksCount'))).toBe(false)
  })

  it.each(['cid', 'uri', 'envelope'])(
    'rejects %s integrity failures instead of publishing an incomplete count',
    async (fault) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = new URL(String(input))
          if (url.pathname.endsWith('getBacklinks'))
            return jsonResponse({ total: 1, records: [{ did: firstDid, collection, rkey: 'unverifiable' }] })
          const record = repositoryRecord(url.searchParams.get('at_uri')!, { $type: collection, subject, createdAt })
          if (fault === 'cid') record.value.createdAt = '2026-01-02T00:00:00Z'
          if (fault === 'uri') record.uri = `at://${secondDid}/${collection}/other`
          return jsonResponse(fault === 'envelope' ? { value: record.value } : record)
        }),
      )
      const client = createTestQueryClient()
      await expect(executeCount(client, new PublicDataService(client))).rejects.toBeInstanceOf(
        PublicDataValidationError,
      )
    },
  )

  it('fails on a later backlink page and recovers when retried', async () => {
    let unavailable = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('getBacklinks')) {
          if (!url.searchParams.has('cursor'))
            return jsonResponse({ total: 999, records: [{ did: firstDid, collection, rkey: 'first' }], cursor: 'next' })
          return unavailable
            ? jsonResponse({ error: 'Unavailable' }, 503)
            : jsonResponse({ total: 999, records: [{ did: secondDid, collection, rkey: 'second' }] })
        }
        return jsonResponse(
          repositoryRecord(url.searchParams.get('at_uri')!, { $type: collection, subject, createdAt }),
        )
      }),
    )
    const client = createTestQueryClient()
    const service = new PublicDataService(client)
    await expect(executeCount(client, service)).rejects.toMatchObject({ status: 503 })
    expect(client.getQueryData(countQueryOptions(service).queryKey)).toBeUndefined()
    unavailable = false
    expect(await executeCount(client, service)).toBe(2)
  })

  it('rejects service failures rather than publishing a partial count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('getBacklinks'))
          return jsonResponse({
            total: 2,
            records: [
              { did: firstDid, collection, rkey: 'valid' },
              { did: secondDid, collection, rkey: 'unavailable' },
            ],
          })
        const uri = url.searchParams.get('at_uri')!
        return uri.endsWith('/unavailable')
          ? jsonResponse({ error: 'Unavailable' }, 503)
          : jsonResponse(repositoryRecord(uri, { $type: collection, subject, createdAt }))
      }),
    )
    const client = createTestQueryClient()
    await expect(executeCount(client, new PublicDataService(client))).rejects.toMatchObject({ status: 503 })
  })

  it('continues across pages beyond the per-request timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('getBacklinks'))
          return jsonResponse({
            total: 999,
            records: [{ did: url.searchParams.has('cursor') ? secondDid : firstDid, collection, rkey: 'record' }],
            cursor: url.searchParams.has('cursor') ? undefined : 'next',
          })
        return new Promise<Response>((resolve) =>
          setTimeout(
            () =>
              resolve(
                jsonResponse(
                  repositoryRecord(url.searchParams.get('at_uri')!, { $type: collection, subject, createdAt }),
                ),
              ),
            10_000,
          ),
        )
      }),
    )
    const client = createTestQueryClient()
    const service = new PublicDataService(client)
    const result =
      collection === 'app.bsky.graph.listblock' ? service.lists.listBlockCount(subject) : executeCount(client, service)
    const completed = expect(result).resolves.toBe(2)
    await vi.advanceTimersByTimeAsync(20_000)
    await completed
  })

  it('rejects multi-page cursor cycles instead of reporting a partial count', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return jsonResponse({ total: 999, records: [], cursor: url.searchParams.get('cursor') === 'a' ? 'b' : 'a' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()
    await expect(executeCount(client, new PublicDataService(client))).rejects.toThrow('repeated a pagination cursor')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cancels an in-flight verification when its consumer leaves', async () => {
    let recordSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('getBacklinks'))
          return jsonResponse({ total: 999, records: [{ did: firstDid, collection, rkey: 'pending' }] })
        recordSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
        return new Promise<Response>((_resolve, reject) =>
          recordSignal?.addEventListener('abort', () => reject(recordSignal?.reason), { once: true }),
        )
      }),
    )
    const client = createTestQueryClient()
    const service = new PublicDataService(client)
    const options = countQueryOptions(service)
    const result = executeCount(client, service)
    const rejection = expect(result).rejects.toThrow()
    await vi.waitFor(() => expect(recordSignal).toBeDefined())
    await client.cancelQueries({ queryKey: options.queryKey })
    await rejection
    expect(recordSignal?.aborted).toBe(true)
  })
})

it('checks the expected publisher, collection and subject before hiding a profile, and searches later candidates', async () => {
  const records = [
    { did: secondDid, collection: 'app.bsky.graph.block', rkey: 'foreign' },
    { did: firstDid, collection: 'app.bsky.feed.post', rkey: 'wrong-collection' },
    { did: firstDid, collection: 'app.bsky.graph.block', rkey: 'wrong-subject' },
    { did: firstDid, collection: 'app.bsky.graph.block', rkey: 'valid' },
  ]
  const fetchedRecords: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('getBacklinks')) {
        const later = url.searchParams.has('cursor')
        return jsonResponse({
          total: 999,
          records: later ? records.slice(3) : records.slice(0, 3),
          cursor: later ? undefined : 'next',
        })
      }
      const uri = url.searchParams.get('at_uri')!
      fetchedRecords.push(uri)
      return jsonResponse(
        repositoryRecord(uri, {
          $type: 'app.bsky.graph.block',
          subject: uri.endsWith('/valid') ? targetDid : otherDid,
          createdAt,
        }),
      )
    }),
  )
  expect(
    await new PublicDataService(createTestQueryClient()).blocks.actorBlocksActor({
      blockerDid: firstDid,
      subjectDid: targetDid,
    }),
  ).toBe(true)
  expect(fetchedRecords.map((uri) => uri.split('/').at(-1))).toEqual(expect.arrayContaining(['wrong-subject', 'valid']))
  expect(fetchedRecords.some((uri) => uri.endsWith('/foreign') || uri.endsWith('/wrong-collection'))).toBe(false)
})

it('does not treat a stale block reference as a block', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('getBacklinks'))
        return jsonResponse({
          total: 999,
          records: [{ did: firstDid, collection: 'app.bsky.graph.block', rkey: 'stale' }],
        })
      return jsonResponse(
        repositoryRecord(url.searchParams.get('at_uri')!, {
          $type: 'app.bsky.graph.block',
          subject: otherDid,
          createdAt,
        }),
      )
    }),
  )
  expect(
    await new PublicDataService(createTestQueryClient()).blocks.actorBlocksActor({
      blockerDid: firstDid,
      subjectDid: targetDid,
    }),
  ).toBe(false)
})

it('keeps a shared list count alive when one consumer cancels', async () => {
  const listUri = `at://${targetDid}/app.bsky.graph.list/shared`
  const recordUri = `at://${firstDid}/app.bsky.graph.listblock/shared`
  let finishRecord!: () => void
  let recordSignal: AbortSignal | undefined
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('getBacklinks'))
      return jsonResponse({
        total: 999,
        records: [{ did: firstDid, collection: 'app.bsky.graph.listblock', rkey: 'shared' }],
      })
    recordSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
    return new Promise<Response>((resolve) => {
      finishRecord = () =>
        resolve(
          jsonResponse(
            repositoryRecord(recordUri, {
              $type: 'app.bsky.graph.listblock',
              subject: listUri,
              createdAt,
            }),
          ),
        )
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  const service = new PublicDataService(createTestQueryClient())
  const controller = new AbortController()
  const leaving = service.lists.listBlockCount(listUri, controller.signal)
  const staying = service.lists.listBlockCount(listUri)
  const cancelled = expect(leaving).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(finishRecord).toBeTypeOf('function'))
  controller.abort()
  await cancelled
  expect(recordSignal?.aborted).toBe(false)
  finishRecord()
  expect(await staying).toBe(1)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('withholds a visibility decision when the claimed block cannot be checked', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (new URL(String(input)).pathname.endsWith('getBacklinks'))
        return jsonResponse({
          total: 1,
          records: [{ did: firstDid, collection: 'app.bsky.graph.block', rkey: 'unavailable' }],
        })
      return jsonResponse({ error: 'Unavailable' }, 503)
    }),
  )
  await expect(
    new PublicDataService(createTestQueryClient()).blocks.actorBlocksActor({
      blockerDid: firstDid,
      subjectDid: targetDid,
    }),
  ).rejects.toMatchObject({ status: 503 })
})

it.each([400, 404])('continues from a missing block to a valid candidate with absence status %i', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('getBacklinks'))
        return jsonResponse({
          total: 2,
          records: [
            {
              did: firstDid,
              collection: 'app.bsky.graph.block',
              rkey: url.searchParams.has('cursor') ? 'valid' : 'deleted',
            },
          ],
          cursor: url.searchParams.has('cursor') ? undefined : 'next',
        })
      const uri = url.searchParams.get('at_uri')!
      return uri.endsWith('/deleted')
        ? jsonResponse({ error: 'RecordNotFound' }, status)
        : jsonResponse(
            repositoryRecord(uri, {
              $type: 'app.bsky.graph.block',
              subject: targetDid,
              createdAt,
            }),
          )
    }),
  )
  expect(
    await new PublicDataService(createTestQueryClient()).blocks.actorBlocksActor({
      blockerDid: firstDid,
      subjectDid: targetDid,
    }),
  ).toBe(true)
})

it('checks a page concurrently and releases verification records from the cache', async () => {
  const client = createTestQueryClient()
  let active = 0
  let maxActive = 0
  let completedRequests = 0
  const completions: Array<() => void> = []
  const records = Array.from({ length: 12 }, (_, index) => ({
    did: index % 2 ? firstDid : secondDid,
    collection: 'app.bsky.graph.block',
    rkey: `record-${index}`,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('getBacklinks')) return jsonResponse({ total: 999, records })
      active++
      maxActive = Math.max(maxActive, active)
      return new Promise<Response>((resolve) => {
        completions.push(() => {
          active--
          completedRequests++
          resolve(
            jsonResponse(
              repositoryRecord(url.searchParams.get('at_uri')!, {
                $type: 'app.bsky.graph.block',
                subject: targetDid,
                createdAt,
              }),
            ),
          )
        })
      })
    }),
  )
  const result = client.query(verifiedBlockCountQueryOptions(new PublicDataService(client)))
  await vi.waitFor(() => expect(completions.length).toBeGreaterThan(1))
  while (completedRequests < records.length) {
    await vi.waitFor(() => expect(completions.length).toBeGreaterThan(0))
    completions.splice(0, completions.length).forEach((finish) => finish())
  }
  expect(await result).toBe(2)
  expect(maxActive).toBeGreaterThan(1)
  expect(maxActive).toBeLessThanOrEqual(6)
  await vi.waitFor(() =>
    expect(
      client
        .getQueryCache()
        .getAll()
        .filter(({ state }) => state.data !== null && typeof state.data === 'object' && 'uri' in state.data),
    ).toHaveLength(0),
  )
})

it('stops a failed verification page without cancelling another consumer of a sibling record', async () => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const sharedUri = `at://${secondDid}/app.bsky.graph.block/shared`
  let failFirst!: () => void
  let finishShared!: () => void
  let sharedSignal: AbortSignal | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('getBacklinks'))
        return jsonResponse({
          total: 2,
          records: [
            { did: firstDid, collection: 'app.bsky.graph.block', rkey: 'failure' },
            { did: secondDid, collection: 'app.bsky.graph.block', rkey: 'shared' },
          ],
        })
      return new Promise<Response>((resolve) => {
        if (url.searchParams.get('at_uri')?.endsWith('/failure')) {
          failFirst = () => resolve(jsonResponse({ error: 'Unavailable' }, 503))
        } else {
          sharedSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
          finishShared = () =>
            resolve(
              jsonResponse(
                repositoryRecord(sharedUri, {
                  $type: 'app.bsky.graph.block',
                  subject: targetDid,
                  createdAt,
                }),
              ),
            )
        }
      })
    }),
  )
  const count = client.query(verifiedBlockCountQueryOptions(service))
  const failed = expect(count).rejects.toMatchObject({ status: 503 })
  await vi.waitFor(() => expect(finishShared).toBeTypeOf('function'))
  const independent = service.core.recordForVerification(sharedUri)
  failFirst()
  await failed
  expect(sharedSignal?.aborted).toBe(false)
  finishShared()
  expect(await independent).toMatchObject({ uri: sharedUri })
  expect(client.getQueryData(verifiedBlockCountQueryOptions(service).queryKey)).toBeUndefined()
})
