import { expect, it, vi } from 'vitest'
import { queryLabels } from '../src/data/api/labels'
import { createTestService, jsonResponse } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const providerDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
const otherProviderDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
const label = (sourceDid: string, value: string) => ({
  ver: 1,
  src: sourceDid,
  uri: did,
  val: value,
  cts: '2026-01-01T00:00:00Z',
})

it('preserves malformed direct-provider rows and continues to later pages without accepting forged sources', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'labelers.firehose.stream')
        return jsonResponse({ labels: [label(providerDid, 'discovery'), {}] })
      if (url.hostname === 'public.api.bsky.app') return jsonResponse({ labels: [{}] })
      if (url.hostname === 'plc.directory')
        return jsonResponse({
          id: providerDid,
          service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://labels.example' }],
        })
      if (url.hostname === 'labels.example') {
        const cursor = url.searchParams.get('cursor')
        if (!cursor)
          return jsonResponse({ labels: [{}, label(providerDid, 'valid'), label(did, 'forged')], cursor: 'malformed' })
        if (cursor === 'malformed') return jsonResponse({ labels: [{}], cursor: 'older' })
        return jsonResponse({ labels: [label(providerDid, 'recovered')] })
      }
      throw new Error(`Unexpected URL ${url}`)
    }),
  )
  const service = createTestService()
  const appView = await service.labels.labels(did)
  expect(appView.items).toHaveLength(1)
  expect(appView.items[0].kind).toBe('unavailable')
  const direct = await service.labels.labels(did, appView.cursor)
  expect(direct.items).toHaveLength(2)
  expect(direct.items).toContainEqual(expect.objectContaining({ kind: 'labelEvent', value: 'valid' }))
  expect(direct.items).not.toContainEqual(expect.objectContaining({ value: 'forged' }))
  const malformed = direct.items.find((item) => item.kind === 'unavailable')!
  expect(malformed.id).not.toBe(appView.items[0].id)
  const continuing = await service.labels.labels(did, direct.cursor)
  expect(continuing.items).toMatchObject([{ kind: 'unavailable' }])
  expect(continuing.cursor).toBeDefined()
  expect(continuing.items[0].id).not.toBe(malformed.id)
  const recovered = await service.labels.labels(did, continuing.cursor)
  expect(recovered.items).toMatchObject([{ value: 'recovered' }])
  expect(recovered.cursor).toBeUndefined()
})

it('gives malformed rows stable IDs scoped to their complete request context and position', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ labels: [{}, {}] })),
  )
  const options = { service: 'https://labels.example', uriPatterns: [did], sources: [providerDid] }
  const first = await queryLabels(options)
  const repeated = await queryLabels(options)
  expect(repeated.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id))
  const variants = await Promise.all([
    queryLabels({ ...options, service: 'https://other-labels.example' }),
    queryLabels({ ...options, sources: [otherProviderDid] }),
    queryLabels({ ...options, uriPatterns: [providerDid] }),
    queryLabels({ ...options, cursor: 'older' }),
    queryLabels({ ...options, limit: 100 }),
  ])
  const ids = [first, ...variants].flatMap((page) => page.items.map((item) => item.id))
  expect(new Set(ids).size).toBe(ids.length)
  const reordered = await queryLabels({
    ...options,
    uriPatterns: [providerDid, did],
    sources: [otherProviderDid, providerDid],
  })
  const sorted = await queryLabels({
    ...options,
    uriPatterns: [did, providerDid],
    sources: [providerDid, otherProviderDid],
  })
  expect(reordered.items.map((item) => item.id)).toEqual(sorted.items.map((item) => item.id))
})

it('replays independent cursor snapshots when provider backfill repeats an AppView event', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'plc.directory')
        return jsonResponse({
          id: providerDid,
          service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: 'https://labels.example' }],
        })
      return jsonResponse({ labels: [label(providerDid, 'shared-event')] })
    }),
  )
  const service = createTestService()
  const appView = await service.labels.labels(did)
  const snapshot = structuredClone(appView.cursor)
  expect(snapshot).not.toHaveProperty('emittedIds')
  const direct = await service.labels.labels(did, appView.cursor)
  const replay = await service.labels.labels(did, appView.cursor)
  expect(direct.items).toMatchObject([{ value: 'shared-event' }])
  expect(direct.items[0].id).toBe(appView.items[0].id)
  expect(replay).toEqual(direct)
  expect(appView.cursor).toEqual(snapshot)
})
