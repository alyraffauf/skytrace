import { expect, it, vi } from 'vitest'
import { loadProviderLabelPage } from '../src/data/labels/providerLabels'
import { SERVICE_URLS } from '../src/config/serviceUrls'
import { did } from './actorFixtures'

it('returns fallback state without changing the provider snapshot or advancing its cursor', async () => {
  const provider = Object.freeze({
    did,
    service: 'https://labels.example',
    cursor: 'direct-cursor',
    seenCursors: ['older'],
    done: false,
  })
  Object.freeze(provider.seenCursors)
  const snapshot = structuredClone(provider)
  const loadLabels = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Provider unavailable'))
    .mockResolvedValueOnce({ items: [], cursor: 'appview-next' })
  const resolveEndpoint = vi.fn()
  const result = await loadProviderLabelPage({ provider, did, loadLabels, resolveEndpoint })
  expect(provider).toEqual(snapshot)
  expect(resolveEndpoint).not.toHaveBeenCalled()
  expect(loadLabels.mock.calls[0][0]).toMatchObject({ service: provider.service, cursor: 'direct-cursor' })
  expect(loadLabels.mock.calls[1][0]).toMatchObject({
    service: SERVICE_URLS.blueskyAppView,
    sources: [did],
    cursor: undefined,
  })
  expect(result.provider).toMatchObject({ useAppView: true, cursor: undefined, seenCursors: undefined, done: false })
  expect(result.page).toEqual({ items: [], cursor: 'appview-next' })
})

it('propagates consumer cancellation instead of marking the provider as failed', async () => {
  const controller = new AbortController()
  const provider = Object.freeze({ did, done: false })
  const resolveEndpoint = vi.fn(async () => {
    controller.abort()
    throw controller.signal.reason
  })
  const loadLabels = vi.fn()
  await expect(
    loadProviderLabelPage({ provider, did, signal: controller.signal, resolveEndpoint, loadLabels }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(provider).not.toHaveProperty('failed')
  expect(loadLabels).not.toHaveBeenCalled()
})
