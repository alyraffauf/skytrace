import { expect, it, vi } from 'vitest'
import { loadProviderLabelPage } from '../src/data/labels/providerLabels'
import { SERVICE_URLS } from '../src/config/serviceUrls'
import { did } from './actorFixtures'

it('loads a direct provider after resolving its endpoint', async () => {
  const provider = Object.freeze({ did, done: false })
  const page = { items: [], cursor: 'next' }
  const loadLabels = vi.fn().mockResolvedValue(page)
  const resolveEndpoint = vi.fn().mockResolvedValue('https://labels.example')
  const result = await loadProviderLabelPage({ provider, did, loadLabels, resolveEndpoint })
  expect(resolveEndpoint).toHaveBeenCalledWith(did, expect.any(AbortSignal))
  expect(loadLabels).toHaveBeenCalledOnce()
  expect(loadLabels.mock.calls[0][0].service).toBe('https://labels.example')
  expect(loadLabels.mock.calls[0][0].sources).toBeUndefined()
  expect(result.page).toBe(page)
  expect(provider).toEqual({ did, done: false })
})

it.each(['missing', 'relay', 'error', 'saved'] as const)(
  'uses AppView with its existing cursor when the endpoint is %s',
  async (endpoint) => {
    const provider = Object.freeze({ did, done: false, cursor: 'saved-cursor', useAppView: endpoint === 'saved' })
    const resolveEndpoint = vi.fn(async () => {
      if (endpoint === 'error') throw new Error('Resolution failed')
      return endpoint === 'relay' ? SERVICE_URLS.labelRelay : undefined
    })
    const page = { items: [] }
    const loadLabels = vi.fn().mockResolvedValue(page)
    const result = await loadProviderLabelPage({ provider, did, loadLabels, resolveEndpoint })
    expect(resolveEndpoint).toHaveBeenCalledTimes(endpoint === 'saved' ? 0 : 1)
    expect(loadLabels).toHaveBeenCalledOnce()
    expect(loadLabels.mock.calls[0][0]).toMatchObject({
      service: SERVICE_URLS.blueskyAppView,
      sources: [did],
      cursor: 'saved-cursor',
    })
    expect(result.provider.useAppView).toBe(true)
    expect(result.page).toBe(page)
  },
)

it('marks the provider failed when both services fail without changing the snapshot', async () => {
  const provider = Object.freeze({ did, done: false, service: 'https://labels.example', cursor: 'direct-cursor' })
  const loadLabels = vi.fn().mockRejectedValue(new Error('Unavailable'))
  const result = await loadProviderLabelPage({ provider, did, loadLabels, resolveEndpoint: vi.fn() })
  expect(loadLabels).toHaveBeenCalledTimes(2)
  expect(result.page).toBeUndefined()
  expect(result.provider).toMatchObject({ failed: true, useAppView: true, cursor: undefined })
  expect(provider).toEqual({ did, done: false, service: 'https://labels.example', cursor: 'direct-cursor' })
})

it.each([false, true])('propagates cancellation during a label request, AppView=%s', async (useAppView) => {
  const controller = new AbortController()
  const provider = Object.freeze({ did, done: false, service: 'https://labels.example', useAppView })
  const loadLabels = vi.fn(async () => {
    controller.abort()
    throw controller.signal.reason
  })
  await expect(
    loadProviderLabelPage({ provider, did, loadLabels, resolveEndpoint: vi.fn(), signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(loadLabels).toHaveBeenCalledOnce()
  expect(provider).not.toHaveProperty('failed')
})

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
