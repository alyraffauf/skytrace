import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { SOCIAL_APPS } from '../src/config/socialApps'
import { socialListPath, socialPathForAtUri, socialPostPath, socialProfilePath } from '../src/lib/links'
import { normalizeActorInput } from '../src/lib/parse'
import { queryKeys } from '../src/data/queryKeys'
import { useRouteActor } from '../src/hooks/useRouteActor'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
import { FaqPage } from '../src/pages/FaqPage'
import { ListPage } from '../src/pages/ListPage'
import { listPath, profilePath, profileTabPath } from '../src/routes/paths'
import { createTestQueryClient } from './testUtils'

const actors = [
  'did:plc:ewvi7nxzyoun6zhxrhs64oiz',
  'did:web:example.com%3A8443',
  'did:web:example.com:user%25name',
  'did:web:example.com:user%2Fname',
  'did:web:example.com:user%2fname',
]

function RouteParameters() {
  const actor = useRouteActor()
  const { tab, rkey } = useParams()
  return <output data-testid="parameters">{JSON.stringify({ actor, tab, rkey })}</output>
}

describe('generated internal routes', () => {
  it.each([
    ['/profile/did:plc:ewvi7nxzyoun6zhxrhs64oiz', 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'],
    ['/profile/did:web:example.com%ZZ', 'did:web:example.com%ZZ'],
    ['/profile/', ''],
  ])('reads the actor from %s without throwing', (pathname, actor) => {
    const { result } = renderHook(useRouteActor, {
      wrapper: ({ children }) => <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>,
    })

    expect(result.current).toBe(actor)
  })

  it.each(
    actors.flatMap((actor) => [
      { name: 'profile', actor, path: profilePath(actor), expected: { actor } },
      { name: 'profile tab', actor, path: profileTabPath(actor, 'labels'), expected: { actor, tab: 'labels' } },
      {
        name: 'list',
        actor,
        path: listPath(`at://${actor}/app.bsky.graph.list/test:list`)!,
        expected: { actor, rkey: 'test:list' },
      },
    ]),
  )('preserves $actor when navigating to its $name', ({ path, expected }) => {
    render(
      <MemoryRouter>
        <Link to={path}>Open</Link>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/profile/:actor/:tab?" element={<RouteParameters />} />
          <Route path="/list/:actor/:rkey" element={<RouteParameters />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Open' }))

    expect(JSON.parse(screen.getByTestId('parameters').textContent!)).toEqual(expected)
  })

  it('applies profile visibility to the original DID containing an encoded slash', async () => {
    const actor = 'did:web:example.com:user%2Fname'
    vi.stubGlobal('__SKYTRACE_CONFIG__', { hiddenDids: [actor] })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={[profilePath(actor)]}>
          <Routes>
            <Route path="/profile/:actor" element={<ProfileLayout />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens a list using its unchanged AT URI when the owner DID contains an encoded slash', async () => {
    const actor = 'did:web:example.com:user%2Fname'
    const listUri = `at://${actor}/app.bsky.graph.list/test:list`
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.identity(actor), {
      kind: 'actorIdentity',
      did: actor,
      handle: 'example.com',
      pds: 'https://pds.example',
    })
    client.setQueryData(queryKeys.listSummary(listUri), {
      kind: 'unavailable',
      id: listUri,
      reason: 'The original list address was preserved.',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[listPath(listUri)!]}>
          <Routes>
            <Route path="/list/:actor/:rkey" element={<ListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('The original list address was preserved.')).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('generated social links', () => {
  it.each(actors)('preserves %s when its social profile, post, or list URL is pasted back', (actor) => {
    const listUri = `at://${actor}/app.bsky.graph.list/test:list`
    const postUri = `at://${actor}/app.bsky.feed.post/test:post`
    const paths = [
      socialProfilePath(actor),
      socialPostPath(actor, 'test:post'),
      socialListPath(actor, 'test:list'),
      socialPathForAtUri(listUri)!,
      socialPathForAtUri(postUri)!,
    ]

    for (const app of SOCIAL_APPS) {
      for (const path of paths) {
        expect(normalizeActorInput(`${app.origin}${path}`)).toBe(actor)
      }
    }
  })

  it('preserves the configured opt-out DID in the FAQ link', () => {
    const actor = 'did:web:example.com%3A8443'
    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: actor })
    render(<FaqPage />)

    const href = screen.getByRole('link', { name: "SkyTrace's Bluesky account" }).getAttribute('href')!

    expect(normalizeActorInput(href)).toBe(actor)
  })
})
