import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { LabeledPostsTab } from '../src/pages/ProfileTabs'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import type { LabeledPost } from '../src/types'
import { createTestQueryClient } from './testUtils'

it('keeps observing after a fast empty page so older labeled posts can load', async () => {
  vi.useFakeTimers()
  const observers = new Set<{ callback: IntersectionObserverCallback; disconnect: () => void }>()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(public callback: IntersectionObserverCallback) {}
      observe() {
        observers.add(this)
      }
      disconnect() {
        observers.delete(this)
      }
    },
  )
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
  client.setQueryData(queryKeys.profileView(did), {
    kind: 'actorProfile',
    identity: { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' },
    hasNoUnauthenticatedSelfLabel: false,
  })
  client.setQueryData(queryKeys.labelDefinitions(did), [])
  const olderPost: LabeledPost = {
    kind: 'labeledPost',
    post: {
      kind: 'post',
      uri: `at://${did}/app.bsky.feed.post/older`,
      author: { kind: 'actorReference', did },
      createdAt: '2025-08-29T04:30:05Z',
      text: 'Older labeled post',
      facets: [],
    },
    labels: [
      {
        kind: 'labelEvent',
        id: 'older-label',
        source: { kind: 'actorReference', did },
        sourceDid: did,
        subject: `at://${did}/app.bsky.feed.post/older`,
        value: 'bot',
        negated: false,
        createdAt: '2025-08-29T04:30:05Z',
      },
    ],
  }
  const cursor = { kind: 'labeledPosts' as const, did, seenRepositoryCursors: [], repositoryCursor: 'next' }
  const load = vi
    .spyOn(service, 'labeledPosts')
    .mockResolvedValueOnce({ items: [], cursor })
    .mockResolvedValueOnce({ items: [], cursor: { ...cursor, repositoryCursor: 'older' } })
    .mockResolvedValueOnce({ items: [olderPost] })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route
            element={
              <Outlet context={{ profile: { identity: { did }, hasNoUnauthenticatedSelfLabel: false }, service }} />
            }
          >
            <Route index element={<LabeledPostsTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(observers.size).toBe(1)
  await act(async () => {
    for (const observer of observers)
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      )
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(load).toHaveBeenCalledTimes(2)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(observers.size).toBe(1)
  await act(async () => {
    for (const observer of observers)
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      )
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.getByText('Older labeled post')).toBeVisible()
  expect(screen.getByText('Bot')).toBeVisible()
  expect(screen.queryByText('No labeled posts found')).not.toBeInTheDocument()
  expect(observers.size).toBe(0)
  expect(load).toHaveBeenCalledTimes(3)
})
