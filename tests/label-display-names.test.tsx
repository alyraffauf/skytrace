import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { useLabelDisplayNames } from '../src/hooks/useLabelDisplayNames'
import * as names from '../src/lib/labels/names'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import type { LabelEvent } from '../src/types'
import { did } from './actorFixtures'
import { createTestQueryClient } from './testUtils'

it('resolves repeated values once per provider, including names that are missing', () => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const otherDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
  for (const [sourceDid, name] of [
    [did, 'First provider'],
    [otherDid, 'Second provider'],
  ] as const) {
    client.setQueryData(queryKeys.labelDefinitions(sourceDid), [
      { identifier: 'custom', locales: [{ lang: 'en', name }] },
    ])
  }
  const labels: LabelEvent[] = Array.from({ length: 1_000 }, (_, index) => ({
    kind: 'labelEvent',
    id: String(index),
    sourceDid: index % 2 ? did : otherDid,
    subject: did,
    value: index % 4 < 2 ? 'custom' : 'missing',
    createdAt: '2026-01-01T00:00:00Z',
    negated: false,
  }))
  const resolveName = vi.spyOn(names, 'labelDisplayName')
  const { result } = renderHook(() => useLabelDisplayNames(labels, service), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  expect(result.current.size).toBe(500)
  expect(result.current.get('0')).toBe('Second provider')
  expect(result.current.get('1')).toBe('First provider')
  expect(result.current.has('2')).toBe(false)
  expect(resolveName).toHaveBeenCalledTimes(4)
})

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
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-CA'])
  const { result, rerender } = renderHook(() => useLabelDisplayNames([label], service), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  expect(result.current.has(label.id)).toBe(false)
  await act(async () => {
    client.setQueryData(queryKeys.labelDefinitions(did), [
      {
        identifier: 'custom',
        locales: [
          { lang: 'en', name: 'English' },
          { lang: 'fr', name: 'French' },
        ],
      },
    ])
  })
  await waitFor(() => expect(result.current.get(label.id)).toBe('French'))
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de'])
  rerender()
  expect(result.current.get(label.id)).toBe('English')
})
