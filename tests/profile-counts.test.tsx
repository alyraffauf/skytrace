import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route, createMemoryRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
import { PROFILE_TABS } from '../src/routes/profileTabs'
import { jsonResponse as response, repositoryRecord } from './testUtils'
import { did, identity, profile } from './actorFixtures'

describe('profile relationship counts', () => {
  it('shows the independently loaded counts in their tab labels', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const requestedUrls: URL[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        requestedUrls.push(url)
        if (url.pathname.endsWith('getBacklinksCount')) return response({ total: 3_000 })
        if (url.pathname.endsWith('resolveMiniDoc')) {
          return response({ did, handle: identity.handle, pds: identity.pds, signing_key: 'zQ3test' })
        }
        if (url.pathname.endsWith('getRecordByUri')) {
          return response(
            repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, {
              $type: 'app.bsky.actor.profile',
              displayName: profile.displayName,
              pronouns: profile.pronouns,
            }),
          )
        }
        if (url.hostname === 'pds.example') {
          return response({ records: [{}, {}] })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider
          router={createMemoryRouter(
            createRoutesFromElements(
              <>
                <Route path="profile/:actor" element={<ProfileLayout />}>
                  <Route index element={<div>Feed content</div>} />
                </Route>
              </>,
            ),
            { initialEntries: ['/profile/atproto.com'] },
          )}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('link', { name: 'Blocked (2)' })).toBeVisible()
    expect(await screen.findByRole('link', { name: 'Blocked by (3,000)' })).toBeVisible()
    expect(screen.getByText('they/them')).toBeVisible()
    expect(screen.getByRole('img', { name: `${profile.displayName}'s avatar` })).toBeVisible()
    expect(requestedUrls.some((url) => url.pathname.endsWith('getBacklinks'))).toBe(false)
    expect(requestedUrls.filter((url) => url.pathname.endsWith('getRecordByUri'))).toHaveLength(1)
  })

  it.each([
    {
      scenario: 'shows the profile when neither account blocks the other',
      profileBlocks: false,
      instanceBlocks: false,
      message: null,
    },
    {
      scenario: 'shows the opt-out message when the profile blocks the instance',
      profileBlocks: true,
      instanceBlocks: false,
      message: 'This account blocks SkyTrace on Bluesky, so its profile and public records are not shown here.',
    },
    {
      scenario: 'shows the ban message when the instance blocks the profile',
      profileBlocks: false,
      instanceBlocks: true,
      message: 'This profile has been blocked from SkyTrace.',
    },
    {
      scenario: 'shows the ban message when both accounts block each other',
      profileBlocks: true,
      instanceBlocks: true,
      message: 'This profile has been blocked from SkyTrace.',
    },
  ])('$scenario even when count tabs are hidden', async ({ profileBlocks, instanceBlocks, message }) => {
    const blockTargetDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', {
      ignoreNoUnauthenticated: false,
      blockTargetDid,
      hiddenDids: ['did:web:unrelated.example'],
      disabledTabs: ['blocking', 'blocked-by'],
    })
    const requestedUrls: URL[] = []
    const blocks = [
      ...(profileBlocks ? [{ blocker: did, subject: blockTargetDid }] : []),
      ...(instanceBlocks ? [{ blocker: blockTargetDid, subject: did }] : []),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        requestedUrls.push(url)
        if (url.pathname.endsWith('resolveMiniDoc')) {
          return response({ did, handle: identity.handle, pds: identity.pds, signing_key: 'zQ3test' })
        }
        if (url.pathname.endsWith('getRecordByUri')) {
          const block = blocks.find(
            (block) => url.searchParams.get('at_uri') === `at://${block.blocker}/app.bsky.graph.block/3example`,
          )
          if (block)
            return response(
              repositoryRecord(url.searchParams.get('at_uri')!, {
                $type: 'app.bsky.graph.block',
                subject: block.subject,
                createdAt: '2026-01-01T00:00:00Z',
              }),
            )
          return response(
            repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, {
              $type: 'app.bsky.actor.profile',
              displayName: profile.displayName,
            }),
          )
        }
        if (url.pathname.endsWith('getBacklinks')) {
          const matches = blocks.filter(
            (block) =>
              (!url.searchParams.has('did') || block.blocker === url.searchParams.get('did')) &&
              block.subject === url.searchParams.get('subject'),
          )
          return response({
            total: matches.length,
            records: matches.map((block) => ({
              did: block.blocker,
              collection: 'app.bsky.graph.block',
              rkey: '3example',
            })),
            cursor: null,
          })
        }
        if (url.hostname === 'pds.example' && url.pathname.endsWith('listRecords')) return response({ records: [] })
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const view = render(
      <QueryClientProvider client={queryClient}>
        <main>
          <RouterProvider
            router={createMemoryRouter(
              createRoutesFromElements(
                <>
                  <Route path="profile/:actor" element={<ProfileLayout />}>
                    <Route index element={<div>Feed content</div>} />
                  </Route>
                </>,
              ),
              { initialEntries: ['/profile/atproto.com'] },
            )}
          />
        </main>
      </QueryClientProvider>,
    )

    if (message) {
      expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeVisible()
      expect(document.title).toBe('Profile unavailable — SkyTrace')
      expect(screen.getByText(message)).toBeVisible()
      expect(view.queryByText('Feed content')).not.toBeInTheDocument()
      expect(requestedUrls.some((url) => url.hostname === 'pds.example')).toBe(false)
      expect(requestedUrls.some((url) => url.pathname.endsWith('getBacklinksCount'))).toBe(false)
    } else {
      expect(await screen.findByText('Feed content')).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Profile unavailable' })).not.toBeInTheDocument()
    }
  })
})

describe('profile block count configuration', () => {
  function renderProfile(blockPage: (requestNumber: number) => unknown, queryClient: QueryClient) {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    let blockPageRequests = 0
    let backlinkPageRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname.endsWith('getBacklinksCount')) {
          backlinkPageRequests++
          return response({ total: 3 })
        }
        if (url.pathname.endsWith('resolveMiniDoc')) {
          return response({ did, handle: identity.handle, pds: identity.pds, signing_key: 'zQ3test' })
        }
        if (url.pathname.endsWith('getRecordByUri')) {
          return response(
            repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, { $type: 'app.bsky.actor.profile' }),
          )
        }
        if (url.hostname === 'pds.example') return response(blockPage(++blockPageRequests))
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider
          router={createMemoryRouter(
            createRoutesFromElements(
              <Route path="profile/:actor" element={<ProfileLayout />}>
                <Route index element={<div>Feed content</div>} />
                <Route path="blocking" element={<div>Blocking content</div>} />
              </Route>,
            ),
            { initialEntries: ['/profile/atproto.com'] },
          )}
        />
      </QueryClientProvider>,
    )
    return { blockPageRequests: () => blockPageRequests, backlinkPageRequests: () => backlinkPageRequests }
  }

  it.each([
    { disabledTabs: ['blocking'], blocking: false, blockedBy: true },
    { disabledTabs: ['blocked-by'], blocking: true, blockedBy: false },
    { disabledTabs: PROFILE_TABS.map((tab) => tab.id), blocking: false, blockedBy: false },
  ])(
    'only scans counts for visible tabs when $disabledTabs are disabled',
    async ({ disabledTabs, blocking, blockedBy }) => {
      vi.stubGlobal('__SKYTRACE_CONFIG__', { disabledTabs })
      const view = renderProfile(
        () => ({ records: [{}] }),
        new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      )

      expect(await screen.findByText('Feed content')).toBeVisible()
      if (blocking) expect(await screen.findByRole('link', { name: 'Blocked (1)' })).toBeVisible()
      else expect(screen.queryByRole('link', { name: /^Blocked( \(|$)/ })).not.toBeInTheDocument()
      if (blockedBy) expect(await screen.findByRole('link', { name: 'Blocked by (3)' })).toBeVisible()
      else expect(screen.queryByRole('link', { name: /^Blocked by/ })).not.toBeInTheDocument()
      expect(view.blockPageRequests() > 0).toBe(blocking)
      expect(view.backlinkPageRequests() > 0).toBe(blockedBy)
    },
  )
})
