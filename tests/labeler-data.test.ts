import { expect, it, vi } from 'vitest'
import { publicDataServiceFor } from '../src/data/publicData'
import { did } from './actorFixtures'
import { createTestQueryClient, jsonResponse, repositoryRecord } from './testUtils'

it('loads labeler definitions through the shared record cache', async () => {
  const client = createTestQueryClient()
  const service = publicDataServiceFor(client)
  const uri = `at://${did}/app.bsky.labeler.service/self`
  const record = repositoryRecord(uri, {
    $type: 'app.bsky.labeler.service',
    createdAt: '2026-01-01T00:00:00Z',
    policies: {
      labelValues: ['many-replies'],
      labelValueDefinitions: [
        {
          identifier: 'many-replies',
          severity: 'inform',
          blurs: 'none',
          locales: [{ lang: 'en', name: 'Frequent replier', description: 'Replies often.' }],
        },
      ],
    },
  })
  const fetch = vi.fn(async () => jsonResponse(record))
  vi.stubGlobal('fetch', fetch)

  await service.core.record(uri)
  const definitions = await client.query(service.labelers.definitionsQueryOptions(did))
  expect(definitions).toMatchObject([
    {
      identifier: 'many-replies',
      locales: [{ lang: 'en', name: 'Frequent replier' }],
    },
  ])
  expect(fetch).toHaveBeenCalledOnce()
})

it.each([
  { $type: 'app.bsky.labeler.service', createdAt: '2026-01-01T00:00:00Z', policies: { labelValues: [] } },
  { $type: 'app.bsky.labeler.service', policies: { labelValueDefinitions: 'malformed' } },
])('returns no definitions for missing or malformed label policies: %j', async (value) => {
  const client = createTestQueryClient()
  const service = publicDataServiceFor(client)
  const uri = `at://${did}/app.bsky.labeler.service/self`
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse(repositoryRecord(uri, value))),
  )

  await expect(client.query(service.labelers.definitionsQueryOptions(did))).resolves.toEqual([])
})

it.each([
  ['HTTPS://LABELS.EXAMPLE:443/', 'https://labels.example'],
  ['https://labels.example:8443/', 'https://labels.example:8443'],
])('normalizes labeler endpoint %s and caches its result', async (endpoint, expected) => {
  const service = publicDataServiceFor(createTestQueryClient())
  const fetch = vi.fn(async () =>
    jsonResponse({
      id: did,
      service: [{ id: '#atproto_labeler', type: 'AtprotoLabeler', serviceEndpoint: endpoint }],
    }),
  )
  vi.stubGlobal('fetch', fetch)

  await expect(service.labelers.endpoint(did)).resolves.toBe(expected)
  await expect(service.labelers.endpoint(did)).resolves.toBe(expected)
  expect(fetch).toHaveBeenCalledOnce()
})
