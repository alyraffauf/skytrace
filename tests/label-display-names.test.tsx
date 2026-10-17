import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { useLabelDisplayNames } from '../src/hooks/useLabelDisplayNames'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import type { LabelEvent, LabelValueDefinition } from '../src/types'
import { did } from './actorFixtures'
import { createTestQueryClient } from './testUtils'

it('uses updated definitions and language preferences on later calculations', async () => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  client.setQueryData(queryKeys.labelDefinitions(did), [])
  const label: LabelEvent = {
    kind: 'labelEvent',
    id: 'event',
    sourceDid: did,
    subject: did,
    value: 'custom',
    createdAt: '2026-01-01T00:00:00Z',
    negated: false,
  }
  const labels = [label]
  let preferredLanguages = ['fr-CA']
  vi.spyOn(navigator, 'languages', 'get').mockImplementation(() => [...preferredLanguages])
  let finish!: (definitions: LabelValueDefinition[]) => void
  const pending = new Promise<LabelValueDefinition[]>((resolve) => {
    finish = resolve
  })
  const options = service.labelers.definitionsQueryOptions(did)
  vi.spyOn(service.labelers, 'definitionsQueryOptions').mockReturnValue({ ...options, queryFn: () => pending })
  const { result } = renderHook(() => useLabelDisplayNames(labels, service), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  expect(result.current.has(label.id)).toBe(false)
  let refresh!: Promise<void>
  await act(async () => {
    refresh = client.refetchQueries({ queryKey: queryKeys.labelDefinitions(did) })
  })
  expect(client.getQueryState(queryKeys.labelDefinitions(did))?.fetchStatus).toBe('fetching')
  await act(async () => {
    finish([
      {
        identifier: 'custom',
        locales: [
          { lang: 'en', name: 'English' },
          { lang: 'fr', name: 'French' },
        ],
      },
    ])
    await refresh
  })
  await waitFor(() => expect(result.current.get(label.id)).toBe('French'))
  preferredLanguages = ['de']
  await act(async () => {
    window.dispatchEvent(new Event('languagechange'))
  })
  await waitFor(() => expect(result.current.get(label.id)).toBe('English'))
})

it('keeps definitions aligned when providers are reordered, removed, and added', () => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const otherDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
  for (const [sourceDid, name] of [
    [did, 'First'],
    [otherDid, 'Second'],
  ] as const) {
    client.setQueryData(queryKeys.labelDefinitions(sourceDid), [
      { identifier: 'custom', locales: [{ lang: 'en', name }] },
    ])
  }
  const first: LabelEvent = {
    kind: 'labelEvent',
    id: 'first',
    sourceDid: did,
    subject: did,
    value: 'custom',
    createdAt: '2026-01-01T00:00:00Z',
    negated: false,
  }
  const second: LabelEvent = { ...first, id: 'second', sourceDid: otherDid }
  const { result, rerender } = renderHook(({ labels }) => useLabelDisplayNames(labels, service), {
    initialProps: { labels: [first, second] },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  expect([...result.current]).toEqual([
    ['first', 'First'],
    ['second', 'Second'],
  ])
  rerender({ labels: [second, first] })
  expect([...result.current]).toEqual([
    ['second', 'Second'],
    ['first', 'First'],
  ])
  rerender({ labels: [second] })
  expect([...result.current]).toEqual([['second', 'Second']])
  rerender({ labels: [second, { ...first, id: 'added' }] })
  expect([...result.current]).toEqual([
    ['second', 'Second'],
    ['added', 'First'],
  ])
})
