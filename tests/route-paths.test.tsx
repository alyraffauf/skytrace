import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  createMemoryRouter,
  Link,
  matchRoutes,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useParams,
} from 'react-router-dom'
import { SOCIAL_APPS } from '../src/config/socialApps'
import { socialListPath, socialPathForAtUri, socialPostPath, socialProfilePath } from '../src/lib/links'
import { normalizeActorInput } from '../src/lib/actors/input'
import { queryKeys } from '../src/data/queryKeys'
import { useRouteActor } from '../src/hooks/useRouteActor'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
import { FaqPage } from '../src/pages/FaqPage'
import { ListPage } from '../src/pages/ListPage'
import { listPath, profilePath, profileTabPath } from '../src/routes/paths'
import { createTestQueryClient } from './testUtils'
import { identity, profile } from './actorFixtures'

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

describe('profile tab navigation', () => {
  const tabs = [
    ['', 'Feed', 'Feed'],
    ['/labels', 'Account labels', 'Account labels'],
    ['/labeled-posts', 'Labeled posts', 'Labeled posts'],
    ['/blocking', 'Blocked', 'Blocked (2)'],
    ['/blocked-by', 'Blocked by', 'Blocked by (3)'],
    ['/lists', 'Lists', 'Lists'],
    ['/listed-on', 'Listed on', 'Listed on'],
  ] as const

  it.each(tabs)('preserves the URL, title, and active tab for %s', (suffix, label, linkLabel) => {
    const actor = 'did:web:example.com:user%2Fname'
    const actorIdentity = { ...identity, did: actor } as const
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileVisibility(actor, undefined, []), {
      visible: true,
      profile: { ...profile, identity: actorIdentity },
    })
    client.setQueryData(queryKeys.blockedCount(actorIdentity), 2)
    client.setQueryData(queryKeys.blockedByCount(actor), 3)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`${profilePath(actor)}${suffix}`]}>
          <Routes>
            <Route path="/profile/:actor" element={<ProfileLayout />}>
              <Route index element={<div>Tab content</div>} />
              <Route path=":tab" element={<div>Tab content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(document.title).toBe(`@${identity.handle} — ${label} — SkyTrace`)
    expect(screen.getByRole('link', { name: linkLabel })).toHaveAttribute('aria-current', 'page')
    for (const [path, , name] of tabs) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', `${profilePath(actor)}${path}`)
    }
  })
})

describe('profile feed alias', () => {
  it('routes each tab and redirects the feed alias to the profile index', async () => {
    const actor = 'did:web:example.com:user%2Fname'
    const actorIdentity = { ...identity, did: actor } as const
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileVisibility(actor, undefined, []), {
      visible: true,
      profile: { ...profile, identity: actorIdentity },
    })
    client.setQueryData(queryKeys.blockedCount(actorIdentity), 2)
    client.setQueryData(queryKeys.blockedByCount(actor), 3)
    client.setQueryData(queryKeys.feed(actor), { pages: [{ items: [] }], pageParams: [undefined] })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const { router } = await import('../src/routes/router')
    router.dispose()
    for (const suffix of ['', '/labels', '/labeled-posts', '/blocking', '/blocked-by', '/lists', '/listed-on']) {
      const route = matchRoutes(router.routes, `${profilePath(actor)}${suffix}`)?.at(-1)?.route
      expect(route).toBeDefined()
      if (suffix) expect(route!.path).toBe(suffix.slice(1))
      else expect(route!.index).toBe(true)
    }
    const memoryRouter = createMemoryRouter(router.routes, { initialEntries: [`${profilePath(actor)}/feed`] })
    const view = render(
      <QueryClientProvider client={client}>
        <RouterProvider router={memoryRouter} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'No posts or reposts found' })).toBeVisible()
    expect(decodeURIComponent(memoryRouter.state.location.pathname)).toBe(`/profile/${actor}`)
    expect(document.title).toBe(`@${identity.handle} — Feed — SkyTrace`)
    view.unmount()
    memoryRouter.dispose()
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
