import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route, createMemoryRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
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
        if (url.pathname.endsWith('getBacklinksCount')) {
          return response({ total: 3_000 })
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
  ])('$scenario', async ({ profileBlocks, instanceBlocks, message }) => {
    const blockTargetDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', {
      ignoreNoUnauthenticated: false,
      blockTargetDid,
      hiddenDids: ['did:web:unrelated.example'],
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
              block.blocker === url.searchParams.get('did') && block.subject === url.searchParams.get('subject'),
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
        if (url.pathname.endsWith('getBacklinksCount')) return response({ total: 0 })
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
