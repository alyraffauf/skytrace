import { describe, expect, it, vi } from 'vitest'
import { createTestService, jsonResponse } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
const firstSubject = `at://${did}/app.bsky.feed.post/first`
const secondSubject = `at://${did}/app.bsky.feed.post/second`
const label = (subject: string, value: string, negated = false) => ({
  ver: 1,
  src: sourceDid,
  uri: subject,
  val: value,
  cts: negated ? '2026-02-01T00:00:00Z' : '2026-01-01T00:00:00Z',
  neg: negated,
})

it('waits for every subject page and deduplicates subjects and label events', async () => {
  let finish!: (response: Response) => void
  const requests: Array<[string, string | null]> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const subject = url.searchParams.get('uriPatterns')!
      const cursor = url.searchParams.get('cursor')
      requests.push([subject, cursor])
      expect(url.searchParams.getAll('uriPatterns')).toEqual([subject])
      if (subject === secondSubject) return jsonResponse({ labels: [label(subject, 'second')] })
      if (!cursor) return jsonResponse({ labels: [label(subject, 'first')], cursor: 'older' })
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    }),
  )
  let settled = false
  const result = createTestService().subjectLabels.forSubjects([firstSubject, secondSubject, firstSubject])
  void result.then(() => {
    settled = true
  })
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  expect(settled).toBe(false)
  finish(jsonResponse({ labels: [label(firstSubject, 'first'), label(firstSubject, 'first', true)] }))
  const labels = await result
  expect(labels).toHaveLength(3)
  expect(labels.filter((event) => event.subject === firstSubject).map((event) => event.negated)).toEqual([false, true])
  expect(requests).toEqual(
    expect.arrayContaining([
      [firstSubject, null],
      [firstSubject, 'older'],
      [secondSubject, null],
    ]),
  )
  expect(requests).toHaveLength(3)
})

it('continues after an empty label page with a cursor', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return jsonResponse(
        url.searchParams.has('cursor') ? { labels: [label(firstSubject, 'older')] } : { labels: [], cursor: 'older' },
      )
    }),
  )
  expect(await createTestService().subjectLabels.forSubjects([firstSubject])).toMatchObject([{ value: 'older' }])
})

it('rejects later-page failures and reuses earlier cached pages on retry', async () => {
  let firstPageRequests = 0
  let olderPageRequests = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (!url.searchParams.has('cursor')) {
        firstPageRequests++
        return jsonResponse({ labels: [label(firstSubject, 'first')], cursor: 'older' })
      }
      if (++olderPageRequests === 1) return jsonResponse({ error: 'Unavailable' }, 503)
      return jsonResponse({ labels: [label(firstSubject, 'older')] })
    }),
  )
  const service = createTestService()
  await expect(service.subjectLabels.forSubjects([firstSubject])).rejects.toThrow()
  expect(await service.subjectLabels.forSubjects([firstSubject])).toHaveLength(2)
  expect(firstPageRequests).toBe(1)
  expect(olderPageRequests).toBe(2)
})

it('rejects cursor cycles while draining a subject', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return jsonResponse({ labels: [], cursor: url.searchParams.get('cursor') === 'a' ? 'b' : 'a' })
  })
  vi.stubGlobal('fetch', fetchMock)
  await expect(createTestService().subjectLabels.forSubjects([firstSubject])).rejects.toThrow(
    'repeated a pagination cursor',
  )
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('cancels an in-flight later page without publishing partial labels', async () => {
  let fetchSignal: AbortSignal | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (!url.searchParams.has('cursor'))
        return jsonResponse({ labels: [label(firstSubject, 'first')], cursor: 'older' })
      fetchSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined)
      return new Promise<Response>((_resolve, reject) => {
        fetchSignal?.addEventListener('abort', () => reject(fetchSignal?.reason), { once: true })
      })
    }),
  )
  const controller = new AbortController()
  const result = createTestService().subjectLabels.forSubjects([firstSubject], controller.signal)
  const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(fetchSignal).toBeDefined())
  controller.abort()
  await rejection
  expect(fetchSignal?.aborted).toBe(true)
})

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  return input instanceof Request ? input.signal : (init?.signal ?? undefined)
}

function pendingUntilAborted(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) =>
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true }),
  )
}

describe('complete label history and cancellation', () => {
  it('returns every page of a long label history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const page = Number(new URL(String(input)).searchParams.get('cursor') ?? '1')
        return jsonResponse({
          labels: [label(firstSubject, `page-${page}`)],
          cursor: page < 125 ? String(page + 1) : undefined,
        })
      }),
    )
    expect(await createTestService().subjectLabels.forSubjects([firstSubject])).toHaveLength(125)
  })

  it('stops sibling subjects after one fails and reports the original failure', async () => {
    let siblingSignal: AbortSignal | undefined
    let failFirstSubject!: () => void
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const subject = new URL(String(input)).searchParams.get('uriPatterns')
        if (subject === firstSubject)
          return new Promise<Response>((resolve) => {
            failFirstSubject = () => resolve(jsonResponse({ error: 'Unavailable' }, 503))
          })
        siblingSignal = requestSignal(input, init)
        return pendingUntilAborted(siblingSignal)
      }),
    )
    const result = createTestService().subjectLabels.forSubjects([firstSubject, secondSubject])
    const rejection = expect(result).rejects.toMatchObject({ status: 503 })
    await vi.waitFor(() => expect(siblingSignal).toBeDefined())
    failFirstSubject()
    await rejection
    expect(siblingSignal?.aborted).toBe(true)
  })

  it('keeps a shared subject request running for another consumer after a sibling failure', async () => {
    let failFirstSubject!: () => void
    let finishSecondSubject!: () => void
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const subject = new URL(String(input)).searchParams.get('uriPatterns')
        return new Promise<Response>((resolve) => {
          if (subject === firstSubject) failFirstSubject = () => resolve(jsonResponse({ error: 'Unavailable' }, 503))
          else finishSecondSubject = () => resolve(jsonResponse({ labels: [label(secondSubject, 'second')] }))
        })
      }),
    )
    const service = createTestService()
    const failing = service.subjectLabels.forSubjects([firstSubject, secondSubject])
    const independent = service.subjectLabels.forSubjects([secondSubject])
    const rejection = expect(failing).rejects.toMatchObject({ status: 503 })
    await vi.waitFor(() => expect(finishSecondSubject).toBeTypeOf('function'))
    await vi.waitFor(() => expect(failFirstSubject).toBeTypeOf('function'))
    failFirstSubject()
    await rejection
    finishSecondSubject()
    expect(await independent).toMatchObject([{ subject: secondSubject, value: 'second' }])
  })
})
