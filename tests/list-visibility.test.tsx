import { execFileSync } from 'node:child_process'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { minimumListBlocking } from '../src/config/listVisibility'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import { ListedOnPage } from '../src/pages/profile/ListedOnPage'
import type { ActorProfile } from '../src/types'
import { createTestQueryClient, jsonResponse, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const listUri = `at://${did}/app.bsky.graph.list/test`
const membershipUri = `at://${did}/app.bsky.graph.listitem/test`
const profile: ActorProfile = {
  kind: 'actorProfile',
  identity: { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' },
  hasNoUnauthenticatedSelfLabel: false,
}

function setup(purpose = 'app.bsky.graph.defs#modlist', count = 0, countStatus = 200) {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname.endsWith('getBacklinksCount')) {
      expect(url.searchParams.get('source')).toBe('app.bsky.graph.listblock:subject')
      expect(url.searchParams.get('subject')).toBe(listUri)
      return jsonResponse(countStatus === 200 ? { total: count } : { error: 'Unavailable' }, countStatus)
    }
    throw new Error(`Unexpected URL ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  client.setQueryData(
    queryKeys.record(membershipUri),
    repositoryRecord(membershipUri, {
      $type: 'app.bsky.graph.listitem',
      list: listUri,
      subject: did,
      createdAt: '2026-01-01T00:00:00Z',
    }),
  )
  client.setQueryData(
    queryKeys.record(listUri),
    repositoryRecord(listUri, {
      $type: 'app.bsky.graph.list',
      name: 'Moderation test',
      purpose,
      createdAt: '2026-01-01T00:00:00Z',
    }),
  )
  return { client, service, fetchMock }
}

function configure(minimum: number | null) {
  vi.stubGlobal('__SKYTRACE_CONFIG__', {
    ignoreNoUnauthenticated: false,
    blockTargetDid: null,
    minListBlocking: minimum,
  })
}

function renderPage(client: ReturnType<typeof createTestQueryClient>, service: PublicDataService) {
  client.setQueryData(queryKeys.profileTab(did, 'listedOn'), {
    pages: [{ items: [{ uri: membershipUri }], cursor: 'next' }],
    pageParams: [undefined],
  })
  let observerCallback: IntersectionObserverCallback | undefined
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={{ profile, service }} />}>
            <Route index element={<ListedOnPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return {
    ...view,
    intersect: () =>
      observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  }
}

describe('Listed On minimum blocking', () => {
  it('shows moderation lists without requesting counts when unset', async () => {
    const { client, service, fetchMock } = setup()
    const membership = await client.fetchQuery(service.graph.listedOnMembershipQueryOptions(membershipUri))
    expect(membership?.kind).toBe('membership')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [0, false],
    [1, true],
    [2, true],
  ])('requires at least one blocker: %i', async (count, visible) => {
    const { client, service } = setup(undefined, count)
    const membership = await client.fetchQuery(service.graph.listedOnMembershipQueryOptions(membershipUri, 1))
    expect(membership !== null).toBe(visible)
  })

  it('does not filter curation lists or request their counts', async () => {
    const { client, service, fetchMock } = setup('app.bsky.graph.defs#curatelist')
    expect((await client.fetchQuery(service.graph.listedOnMembershipQueryOptions(membershipUri, 1)))?.kind).toBe(
      'membership',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the existing list count cache', async () => {
    const { client, service, fetchMock } = setup()
    await client.fetchQuery(service.core.listBlockCountQueryOptions(listUri))
    expect(await client.fetchQuery(service.graph.listedOnMembershipQueryOptions(membershipUri, 1))).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not reuse unfiltered memberships for an enabled threshold', async () => {
    const { client, service } = setup()
    expect(await client.fetchQuery(service.graph.listedOnMembershipQueryOptions(membershipUri))).not.toBeNull()
    expect(await client.fetchQuery(service.graph.listedOnMembershipQueryOptions(membershipUri, 1))).toBeNull()
  })

  it('shows an empty state and retains pagination when all memberships are filtered', async () => {
    configure(1)
    const { client, service } = setup()
    const nextPage = vi.spyOn(service.graph, 'listedOnReferences').mockResolvedValue({ items: [] })
    const view = renderPage(client, service)
    expect(await screen.findByText('No lists match the visibility criteria')).toBeVisible()
    expect(screen.queryByText('Moderation test')).not.toBeInTheDocument()
    act(() => view.intersect())
    await waitFor(() => expect(nextPage).toHaveBeenCalledWith(did, 'next', expect.any(AbortSignal)))
  })

  it('does not show a moderation list when its count fails', async () => {
    configure(1)
    const { client, service } = setup(undefined, 0, 503)
    renderPage(client, service)
    expect(await screen.findByText('This list membership could not be loaded.')).toBeVisible()
    expect(screen.queryByText('Moderation test')).not.toBeInTheDocument()
  })
})

describe('minimum blocking configuration', () => {
  it.each([null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('bypasses invalid or unset values: %s', (minimum) => {
    configure(minimum)
    expect(minimumListBlocking()).toBeUndefined()
  })

  it.each([0, 1, 100])('accepts a whole nonnegative count: %i', (minimum) => {
    configure(minimum)
    expect(minimumListBlocking()).toBe(minimum)
  })

  it.each([
    ['', 'null'],
    ['1', '1'],
    ['0', '0'],
    ['-1', 'null'],
    ['1.5', 'null'],
    ['01', 'null'],
    ['9007199254740992', 'null'],
    ['1;alert(1)', 'null'],
  ])('validates container env value %s', (value, expected) => {
    const output = execFileSync(
      'sh',
      ['-c', '. ./container/15-runtime-config.envsh; printf "%s" "$MIN_LIST_BLOCKING_VALUE"'],
      {
        env: { ...process.env, MIN_LIST_BLOCKING: value },
        encoding: 'utf8',
      },
    )
    expect(output).toBe(expected)
  })
})
