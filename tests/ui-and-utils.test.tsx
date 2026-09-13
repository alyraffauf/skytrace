import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedRow, splitFacetedText } from '../src/components/FeedRow'
import { InfiniteScroll } from '../src/components/InfiniteScroll'
import { ImageWithFallback } from '../src/components/Images'
import { LabelRow } from '../src/components/LabelRow'
import { groupLabelHistory } from '../src/lib/labelHistory'
import { LabeledPostRow } from '../src/components/LabeledPostRow'
import { labelDisplayName } from '../src/components/LabelValue'
import { RelationshipRow } from '../src/components/RelationshipRow'
import { RecordLinksMenu } from '../src/components/RecordLinksMenu'
import { MiniActor } from '../src/components/ActorIdentity'
import { LinkifiedText } from '../src/components/LinkifiedText'
import { mergeFeedItems } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import { labelDefinitionsFromRecord, parseFacets } from '../src/data/recordParsers'
import { normalizeActorInput } from '../src/lib/parse'
import { skythreadPostUrl } from '../src/lib/links'
import { ProfilePage } from '../src/pages/ProfilePage'
import { ListPage } from '../src/pages/ListPage'
import { FeedTab, LabeledPostsTab, LabelsTab, mergeLabeledPosts } from '../src/pages/ProfileTabs'
import { PublicDataService } from '../src/data/publicData'
import type { ActorIdentity, ActorProfile, FeedPost, LabeledPost, LabelEvent, ListSummary } from '../src/types'
import { createTestQueryClient, jsonResponse as response } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }
const profile: ActorProfile = {
  kind: 'actorProfile',
  identity,
  hasNoUnauthenticatedSelfLabel: false,
  displayName: 'AT Protocol',
  pronouns: 'they/them',
}
const actorReference = { kind: 'actorReference' as const, did: identity.did }

function renderWithRouter(element: React.ReactNode) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(queryKeys.profileView(did), profile)
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderProfileTab(element: React.ReactElement, selectedProfile: ActorProfile) {
  const queryClient = createTestQueryClient()
  const service = new PublicDataService(queryClient)
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={{ profile: selectedProfile, service }} />}>
            <Route index element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return view
}

describe('actor input normalization', () => {
  it.each([
    [' @ATPROTO.COM ', 'atproto.com'],
    ['https://bsky.app/profile/atproto.com', 'atproto.com'],
    [`https://bsky.app/profile/${did}`, did],
    ['https://blacksky.community/profile/atproto.com', 'atproto.com'],
    ['https://witchsky.app/profile/ATPROTO.COM', 'atproto.com'],
    [`https://mu.social/profile/${did}`, did],
    ['https://www.mu.social/profile/atproto.com/post/3example', 'atproto.com'],
    [did, did],
  ])('normalizes %s', (input, expected) => expect(normalizeActorInput(input)).toBe(expected))

  it.each(['', 'not a handle', 'https://example.com/profile/atproto.com', 'https://bsky.app/search'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeActorInput(input)).toThrow()
    },
  )
})

describe('plain text links', () => {
  it('links handles, bare domains, and full URLs without raw HTML', () => {
    renderWithRouter(<LinkifiedText text="@atproto.com docs at atproto.com and https://example.com/read" />)
    expect(screen.getByRole('link', { name: '@atproto.com' })).toHaveAttribute('href', '/profile/atproto.com')
    expect(screen.getByRole('link', { name: 'atproto.com' })).toHaveAttribute('href', 'https://atproto.com/')
    expect(screen.getByRole('link', { name: 'https://example.com/read' })).toHaveAttribute(
      'href',
      'https://example.com/read',
    )
  })
})

describe('record links', () => {
  const postUri = `at://${did}/app.bsky.feed.post/3example`

  it('builds Skythread links only for posts', () => {
    expect(skythreadPostUrl(postUri)).toBe(
      `https://skythread.mackuba.eu/?author=${encodeURIComponent(did)}&post=3example`,
    )
    expect(skythreadPostUrl(`at://${did}/app.bsky.graph.block/3example`)).toBeUndefined()
  })

  it('offers Skythread in a post links menu', () => {
    render(<RecordLinksMenu recordUri={postUri} label="post" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open links for post' }))
    expect(screen.getByRole('link', { name: /Skythread/ })).toHaveAttribute('href', skythreadPostUrl(postUri))
  })
})

describe('compact account references', () => {
  it('uses the account handle without repeating its display name', () => {
    renderWithRouter(<MiniActor actor={profile} label="By" />)
    expect(screen.getByRole('link', { name: '@atproto.com' })).toBeVisible()
    expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
  })
})

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
          return response({
            uri: `at://${did}/app.bsky.actor.profile/self`,
            cid,
            value: {
              $type: 'app.bsky.actor.profile',
              displayName: profile.displayName,
              pronouns: profile.pronouns,
            },
          })
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
        <MemoryRouter initialEntries={['/profile/atproto.com']}>
          <Routes>
            <Route path="profile/:actor" element={<ProfilePage />}>
              <Route index element={<div>Feed content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('link', { name: 'Blocked (2)' })).toBeVisible()
    expect(await screen.findByRole('link', { name: 'Blocked by (3,000)' })).toBeVisible()
    expect(screen.getByText('they/them')).toBeVisible()
    const pdsLink = screen.getByRole('link', { name: 'pds.example', hidden: true })
    expect(pdsLink).toHaveAttribute('href', identity.pds)
    const pdsFavicon = pdsLink.querySelector('img')
    expect(pdsFavicon).toHaveAttribute('src', 'https://pds.example/favicon.ico')
    fireEvent.error(pdsFavicon as HTMLImageElement)
    expect(pdsFavicon).not.toBeVisible()
    expect(requestedUrls.some((url) => url.pathname.endsWith('getBacklinks'))).toBe(false)
  })

  it('explains why the profile is unavailable when the account blocks the configured account', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', {
      ignoreNoUnauthenticated: false,
      blockTargetDid: 'did:plc:jwxdvd2mdtdq7la7toiy2rjc',
    })
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
          return response({
            uri: `at://${did}/app.bsky.actor.profile/self`,
            cid,
            value: { $type: 'app.bsky.actor.profile', displayName: profile.displayName },
          })
        }
        if (url.pathname.endsWith('getBacklinks')) {
          return response({
            total: 1,
            records: [{ did, collection: 'app.bsky.graph.block', rkey: '3skytrace' }],
            cursor: null,
          })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/profile/atproto.com']}>
          <Routes>
            <Route path="profile/:actor" element={<ProfilePage />}>
              <Route index element={<div>Feed content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeVisible()
    expect(
      screen.getByText(
        'This account blocks this SkyTrace instance on Bluesky, so its profile and public records are not shown here.',
      ),
    ).toBeVisible()
    expect(view.queryByText('Feed content')).not.toBeInTheDocument()
    expect(requestedUrls.some((url) => url.hostname === 'pds.example')).toBe(false)
    expect(requestedUrls.some((url) => url.pathname.endsWith('getBacklinksCount'))).toBe(false)
  })
})

describe('list block count', () => {
  it('shows how many people block the list', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3skytrace`
    const list: ListSummary = {
      kind: 'list',
      uri: listUri,
      name: 'Test list',
      purpose: 'app.bsky.graph.defs#modlist',
      owner: actorReference,
    }
    let countRequest: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname.endsWith('getBacklinksCount')) {
          countRequest = url
          return response({ total: 12 })
        }
        if (url.pathname.endsWith('getBacklinks')) return response({ total: 0, records: [] })
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.identity(identity.handle), identity)
    queryClient.setQueryData(queryKeys.listSummary(listUri), list)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/list/${identity.handle}/3skytrace`]}>
          <Routes>
            <Route path="list/:actor/:rkey" element={<ListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('12 accounts block this moderation list')).toBeVisible()
    expect(screen.getByText('Date added')).toBeVisible()
    expect(countRequest?.searchParams.get('subject')).toBe(listUri)
    expect(countRequest?.searchParams.get('source')).toBe('app.bsky.graph.listblock:subject')
  })

  it('does not request a block count for a curation list', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3curated`
    const list: ListSummary = {
      kind: 'list',
      uri: listUri,
      name: 'Curation list',
      purpose: 'app.bsky.graph.defs#curatelist',
      owner: actorReference,
    }
    const requestedUrls: URL[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      requestedUrls.push(url)
      if (url.pathname.endsWith('getBacklinks')) return response({ total: 0, records: [] })
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.identity(identity.handle), identity)
    queryClient.setQueryData(queryKeys.listSummary(listUri), list)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/list/${identity.handle}/3curated`]}>
          <Routes>
            <Route path="list/:actor/:rkey" element={<ListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'No members found' })).toBeVisible()
    expect(screen.queryByText(/Blocked by/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
    expect(requestedUrls.some((url) => url.pathname.endsWith('getBacklinksCount'))).toBe(false)
  })
})

describe('list member pagination', () => {
  const listUri = `at://${did}/app.bsky.graph.list/members`
  const membershipUri = `at://${did}/app.bsky.graph.listitem/member`
  function renderMembers(queryClient = createTestQueryClient()) {
    queryClient.setQueryData(queryKeys.identity(identity.handle), identity)
    queryClient.setQueryData(queryKeys.profileView(did), profile)
    queryClient.setQueryData(queryKeys.listSummary(listUri), {
      kind: 'list',
      uri: listUri,
      name: 'Members test',
      purpose: 'app.bsky.graph.defs#curatelist',
      owner: actorReference,
    })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/list/${identity.handle}/members`]}>
          <Routes>
            <Route path="list/:actor/:rkey" element={<ListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return { ...view, queryClient }
  }

  it('keeps six placeholders and the detailed initial error without showing an empty result', async () => {
    let reject!: (error: Error) => void
    vi.spyOn(PublicDataService.prototype, 'listMembers').mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    renderMembers()
    expect(screen.getByLabelText('Loading').querySelectorAll('.size-8')).toHaveLength(6)
    await act(async () => {
      reject(new Error('Membership service explanation'))
    })
    expect(await screen.findByText('Membership service explanation')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Members test' })).toBeVisible()
    expect(screen.queryByText('No members found')).not.toBeInTheDocument()
  })

  it('retains members after refresh failure and prevents pagination during refresh', async () => {
    const activeObservers = new Set<object>()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {
          activeObservers.add(this)
        }
        disconnect() {
          activeObservers.delete(this)
        }
      },
    )
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.listMembers(listUri), {
      pages: [{ items: [{ uri: membershipUri }], cursor: 'next' }],
      pageParams: [undefined],
    })
    queryClient.setQueryData(queryKeys.listMember(listUri, membershipUri), {
      kind: 'unavailable',
      id: membershipUri,
      reason: 'Cached member row',
    })
    let reject!: (error: Error) => void
    const members = vi
      .spyOn(PublicDataService.prototype, 'listMembers')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValue({ items: [{ uri: membershipUri }] })
    renderMembers(queryClient)
    expect(screen.getByText('Cached member row')).toBeVisible()
    expect(activeObservers.size).toBe(1)
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listMembers(listUri) })
    })
    await waitFor(() => expect(activeObservers.size).toBe(0))
    expect(members).toHaveBeenCalledTimes(1)
    await act(async () => {
      reject(new Error('Refresh failed'))
    })
    expect(await screen.findByText("Couldn't refresh members")).toBeVisible()
    expect(screen.getByText('Cached member row')).toBeVisible()
    expect(screen.queryByText('No members found')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText("Couldn't refresh members")).not.toBeInTheDocument())
    expect(members).toHaveBeenCalledTimes(2)
  })
})

describe('profile post privacy', () => {
  const restrictedProfile: ActorProfile = { ...profile, hasNoUnauthenticatedSelfLabel: true }
  const unavailableExplanation = 'This account has chosen not to show its posts on public sites like SkyTrace.'

  it('shows the privacy notice without requesting the feed', () => {
    const fetchMock = vi.fn()
    const feed = vi.spyOn(PublicDataService.prototype, 'feed')
    vi.stubGlobal('fetch', fetchMock)

    renderProfileTab(<FeedTab />, restrictedProfile)

    expect(screen.getByRole('heading', { name: "Posts aren't available here" })).toBeVisible()
    expect(screen.getByText(unavailableExplanation)).toBeVisible()
    expect(feed).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the privacy notice without requesting repositories or label relays', () => {
    const fetchMock = vi.fn()
    const labeledPosts = vi.spyOn(PublicDataService.prototype, 'labeledPosts')
    vi.stubGlobal('fetch', fetchMock)

    renderProfileTab(<LabeledPostsTab />, restrictedProfile)

    expect(screen.getByRole('heading', { name: "Posts aren't available here" })).toBeVisible()
    expect(screen.getByText(unavailableExplanation)).toBeVisible()
    expect(labeledPosts).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps Account labels available for the same profile', async () => {
    const labels = vi.spyOn(PublicDataService.prototype, 'labels').mockResolvedValue({ items: [] })

    renderProfileTab(<LabelsTab />, restrictedProfile)

    expect(await screen.findByRole('heading', { name: 'No account labels found' })).toBeVisible()
    expect(labels).toHaveBeenCalledOnce()
  })

  it('loads both post tabs when the runtime override is enabled', async () => {
    vi.stubGlobal('__SKYTRACE_CONFIG__', { ignoreNoUnauthenticated: true })
    const feed = vi.spyOn(PublicDataService.prototype, 'feed').mockResolvedValue({ items: [] })
    const labeledPosts = vi.spyOn(PublicDataService.prototype, 'labeledPosts').mockResolvedValue({ items: [] })

    const feedView = renderProfileTab(<FeedTab />, restrictedProfile)
    expect(await screen.findByRole('heading', { name: 'No posts or reposts found' })).toBeVisible()
    expect(feed).toHaveBeenCalledOnce()
    feedView.unmount()

    renderProfileTab(<LabeledPostsTab />, restrictedProfile)
    expect(await screen.findByRole('heading', { name: 'No labeled posts found' })).toBeVisible()
    expect(labeledPosts).toHaveBeenCalledOnce()
  })
})

describe('image fallbacks', () => {
  it('shows an image that finished loading before React received its load event', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(100)

    render(<ImageWithFallback src="https://example.com/cached.jpg" alt="Cached avatar" fallback="avatar" />)

    expect(screen.getByRole('img', { name: 'Cached avatar' })).toHaveAttribute('data-loaded', 'true')
  })

  it('resets failure state when the image source changes', async () => {
    const view = render(<ImageWithFallback src="https://example.com/old.jpg" alt="Preview" fallback="image" />)
    fireEvent.error(screen.getByRole('img', { name: 'Preview' }))
    expect(screen.getByRole('img', { name: 'Preview' }).tagName).toBe('SPAN')
    view.rerender(<ImageWithFallback src="https://example.com/new.jpg" alt="Preview" fallback="image" />)
    expect(await screen.findByRole('img', { name: 'Preview' })).toHaveAttribute('src', 'https://example.com/new.jpg')
  })
})

describe('UTF-8 facets', () => {
  it('uses byte offsets without splitting multibyte characters', () => {
    const text = 'Hi 🌤️ @alice.test'
    const start = new TextEncoder().encode('Hi 🌤️ ').length
    const end = new TextEncoder().encode(text).length
    expect(splitFacetedText(text, [{ byteStart: start, byteEnd: end, mentionDid: did }])).toEqual([
      { text: 'Hi 🌤️ ' },
      { text: '@alice.test', facet: { byteStart: start, byteEnd: end, mentionDid: did } },
    ])
  })

  it('keeps every recognized feature and rejects spans inside a UTF-8 character', () => {
    const text = '🌤 link'
    const valid = parseFacets(text, [
      {
        index: { byteStart: 5, byteEnd: 9 },
        features: [
          { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' },
          { $type: 'app.bsky.richtext.facet#tag', tag: 'weather' },
        ],
      },
    ])
    expect(valid).toEqual([{ byteStart: 5, byteEnd: 9, href: 'https://example.com', tag: 'weather' }])
    expect(
      parseFacets(text, [
        { index: { byteStart: 1, byteEnd: 4 }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'broken' }] },
      ]),
    ).toEqual([])
  })
})

describe('pagination utilities', () => {
  it('pauses automatic pagination after an error and offers a manual retry', () => {
    const load = vi.fn()
    const observe = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect() {}
      },
    )
    render(<InfiniteScroll hasMore loading={false} error={new Error('Page failed')} load={load} />)
    expect(observe).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(load).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more")
  })
})

describe('feed merging', () => {
  const post = (uri: FeedPost['uri'], createdAt: string, extra: Partial<FeedPost> = {}): FeedPost => ({
    kind: 'post',
    uri,
    author: actorReference,
    createdAt,
    text: 'hello',
    facets: [],
    ...extra,
  })

  it('deduplicates and sorts all activity chronologically', () => {
    const older = post(`at://${did}/app.bsky.feed.post/old`, '2026-01-01T00:00:00Z')
    const newer = post(`at://${did}/app.bsky.feed.post/new`, '2026-02-01T00:00:00Z')
    expect(
      mergeFeedItems([older, newer, older]).map((item) => (item.kind === 'unavailable' ? item.id : item.uri)),
    ).toEqual([newer.uri, older.uri])
  })
})

describe('relationship rendering', () => {
  it('keeps the DID and external links when profile hydration fails', async () => {
    const unresolvedDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const fetchMock = vi.fn(async () => response({ error: 'UpstreamFailure' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RelationshipRow
            entry={{
              kind: 'relationship',
              id: `at://${did}/app.bsky.graph.block/3abc`,
              actor: { kind: 'actorReference', did: unresolvedDid },
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('link', { name: unresolvedDid })).toBeInTheDocument()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: unresolvedDid })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Open links for ${unresolvedDid}` }))
    expect(screen.getByRole('link', { name: /PDSls/ })).toHaveAttribute(
      'href',
      `https://pdsls.dev/at://${did}/app.bsky.graph.block/3abc`,
    )
    expect(screen.getByRole('link', { name: /Witchsky/ })).toHaveAttribute(
      'href',
      `https://witchsky.app/profile/${unresolvedDid}`,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: `Open links for ${unresolvedDid}` })).toHaveFocus()
  })
})

describe('repost rendering', () => {
  const originalDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
  const post: FeedPost = {
    kind: 'post',
    uri: `at://${originalDid}/app.bsky.feed.post/original`,
    author: { kind: 'actorReference', did: originalDid },
    createdAt: '2026-01-01T00:00:00Z',
    text: 'Original post body',
    facets: [],
    repositoryPds: 'https://original-pds.example',
    images: [{ cid, alt: 'Original image' }],
    video: { cid, alt: 'Original video' },
    replyTo: `at://${originalDid}/app.bsky.feed.post/parent`,
    quoteUri: `at://${originalDid}/app.bsky.feed.post/quote`,
  }
  const repost = {
    kind: 'repost' as const,
    uri: `at://${did}/app.bsky.feed.repost/repost` as const,
    author: actorReference,
    subjectUri: post.uri,
    createdAt: '2026-02-01T00:00:00Z',
  }

  it('loads the original author, preserves media origins and footer, and expands quotes once', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.profileView(did), profile)
    queryClient.setQueryData(queryKeys.profileView(originalDid), {
      ...profile,
      displayName: 'Original author',
      identity: { ...identity, did: originalDid, handle: 'original.example' },
    })
    const service = new PublicDataService(queryClient)
    const postOptions = service.feedPostQueryOptions.bind(service)
    const load = vi.spyOn(service, 'feedPostQueryOptions').mockImplementation((uri) => ({
      ...postOptions(uri),
      queryFn: async () =>
        uri === post.uri
          ? post
          : {
              ...post,
              uri: post.quoteUri!,
              text: 'Quoted body',
              quoteUri: `at://${originalDid}/app.bsky.feed.post/nested`,
            },
    }))
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FeedRow item={repost} service={service} footer={<span>Label footer</span>} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Loading reposted post…')).toBeVisible()
    expect(await screen.findByText('Original post body')).toBeVisible()
    expect(await screen.findByText('Quoted body')).toBeVisible()
    expect(screen.getAllByText('Original author').length).toBeGreaterThan(0)
    expect(screen.getByText('@atproto.com')).toBeVisible()
    expect(screen.getByText('Label footer')).toBeVisible()
    expect(screen.getByText('Reply to a public post')).toBeVisible()
    expect(screen.getAllByAltText('Original image')[0]).toHaveAttribute('src', expect.stringContaining(originalDid))
    expect(view.container.querySelector('source')).toHaveAttribute(
      'src',
      expect.stringContaining('https://original-pds.example/'),
    )
    expect(view.container.querySelector('source')).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(originalDid)),
    )
    expect(load.mock.calls.every(([uri]) => uri === post.uri || uri === post.quoteUri)).toBe(true)
  })

  it('keeps both record menus when the repost target is unavailable', async () => {
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    const postOptions = service.feedPostQueryOptions(post.uri)
    vi.spyOn(service, 'feedPostQueryOptions').mockReturnValue({
      ...postOptions,
      queryFn: async () => ({ kind: 'unavailable', id: post.uri, reason: 'Target deleted' }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FeedRow item={repost} service={service} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Target deleted')).toBeVisible()
    expect(screen.getByRole('button', { name: /repost record/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /unavailable record/ })).toBeVisible()
  })
})

describe('account labels', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })
  it('stops eager pagination after a delayed failure and recovers only on Retry', async () => {
    let rejectPage!: (error: Error) => void
    const cursor = {
      kind: 'labels' as const,
      did,
      uriPatterns: [did],
      relayDone: false,
      seenRelayCursors: [],
      providers: [],
      emittedIds: [],
    }
    const labels = vi
      .spyOn(PublicDataService.prototype, 'labels')
      .mockResolvedValueOnce({
        items: [{ kind: 'unavailable', id: 'loaded', reason: 'Previously loaded label' }],
        cursor,
      })
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectPage = reject
          }),
      )
      .mockResolvedValue({ items: [{ kind: 'unavailable', id: 'recovered', reason: 'Recovered label' }] })
    renderProfileTab(<LabelsTab />, profile)
    await waitFor(() => expect(labels).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Previously loaded label')).toBeVisible()
    await act(async () => {
      rejectPage(new Error('Relay unavailable'))
    })
    const retry = await screen.findByRole('button', { name: 'Retry' })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(labels).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Previously loaded label')).toBeVisible()
    fireEvent.click(retry)
    expect(await screen.findByText('Recovered label')).toBeVisible()
    expect(labels).toHaveBeenCalledTimes(3)
  })

  it('eagerly loads the second label page on success', async () => {
    const labels = vi
      .spyOn(PublicDataService.prototype, 'labels')
      .mockResolvedValueOnce({
        items: [],
        cursor: {
          kind: 'labels',
          did,
          uriPatterns: [did],
          relayDone: false,
          seenRelayCursors: [],
          providers: [],
          emittedIds: [],
        },
      })
      .mockResolvedValue({ items: [{ kind: 'unavailable', id: 'second', reason: 'Second label page' }] })
    renderProfileTab(<LabelsTab />, profile)
    expect(await screen.findByText('Second label page')).toBeVisible()
    expect(labels).toHaveBeenCalledTimes(2)
  })

  it('uses the labeler-provided name with locale fallback', () => {
    const definitions = [
      {
        identifier: 'many-replies',
        locales: [
          { lang: 'en', name: 'Frequent replier', description: 'Replies often.' },
          { lang: 'fr', name: 'Répond souvent', description: 'Répond fréquemment.' },
        ],
      },
    ]

    expect(labelDisplayName('many-replies', definitions, ['fr-CA'])).toBe('Répond souvent')
    expect(labelDisplayName('many-replies', definitions, ['de'])).toBe('Frequent replier')
    expect(labelDisplayName('graphic-media', undefined, ['en'])).toBe('Graphic Media')
    expect(labelDisplayName('unknown-label', undefined, ['en'])).toBeUndefined()
  })

  it('parses definitions from a labeler service record', () => {
    const definitions = labelDefinitionsFromRecord({
      uri: `at://${did}/app.bsky.labeler.service/self`,
      cid,
      value: {
        $type: 'app.bsky.labeler.service',
        createdAt: '2026-01-01T00:00:00Z',
        policies: {
          labelValues: ['many-replies'],
          labelValueDefinitions: [
            {
              identifier: 'many-replies',
              severity: 'inform',
              blurs: 'none',
              locales: [{ lang: 'en', name: 'Frequent replier', description: 'Replies often.' }],
            },
          ],
        },
      },
    })

    expect(definitions).toEqual([
      {
        identifier: 'many-replies',
        locales: [{ lang: 'en', name: 'Frequent replier', description: 'Replies often.' }],
      },
    ])
  })

  it('renders the source DID and preserves negated label history', () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const label: LabelEvent = {
      kind: 'labelEvent',
      id: 'label-event',
      source: { kind: 'actorReference', did: sourceDid },
      sourceDid,
      subject: did,
      value: '!suspend',
      createdAt: '2026-02-01T21:02:00.515Z',
      negated: true,
    }
    renderWithRouter(<LabelRow label={label} />)
    expect(screen.getByText('!suspend')).toBeInTheDocument()
    expect(screen.getAllByText('Removed')[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: sourceDid })).toHaveAttribute('href', `/profile/${sourceDid}`)
  })

  it('shows a resolved name while keeping the raw value available', () => {
    const label: LabelEvent = {
      kind: 'labelEvent',
      id: 'named-label',
      source: actorReference,
      sourceDid: did,
      subject: did,
      value: 'many-replies',
      createdAt: '2026-01-01T00:00:00Z',
      negated: false,
    }
    renderWithRouter(<LabelRow label={label} displayName="Frequent replier" />)
    expect(screen.getByText('Frequent replier')).toHaveAttribute('title', 'Raw label: many-replies')
    expect(screen.queryByText('many-replies')).not.toBeInTheDocument()
  })

  it('uses active state and past tense for expired labels', () => {
    const source = actorReference
    const label = (expiresAt: string): LabelEvent => ({
      kind: 'labelEvent',
      id: expiresAt,
      source,
      sourceDid: did,
      subject: did,
      value: 'test-label',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt,
      negated: false,
    })

    const activeView = renderWithRouter(<LabelRow label={label('2099-01-01T00:00:00Z')} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Expires /)).toBeInTheDocument()
    activeView.unmount()

    renderWithRouter(<LabelRow label={label('2020-01-01T00:00:00Z')} />)
    expect(screen.getAllByText('Expired')[0]).toBeInTheDocument()
    expect(screen.getByLabelText(/^Expired /)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Expires /)).not.toBeInTheDocument()
  })

  it('pairs an applied label with its removal date', () => {
    const source = actorReference
    const added: LabelEvent = {
      kind: 'labelEvent',
      id: 'added',
      source,
      sourceDid: did,
      subject: did,
      value: '!suspend',
      createdAt: '2026-01-01T00:00:00Z',
      negated: false,
    }
    const removed: LabelEvent = {
      ...added,
      id: 'removed',
      createdAt: '2026-02-01T00:00:00Z',
      negated: true,
    }

    const history = groupLabelHistory([removed, added])
    expect(history).toHaveLength(1)
    renderWithRouter(<LabelRow label={history[0]!} />)
    expect(screen.getByLabelText(/^Added /)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Removed /)).toBeInTheDocument()
  })

  it('treats a newer application as the current state instead of showing an expired renewal', () => {
    const source = actorReference
    const expired: LabelEvent = {
      kind: 'labelEvent',
      id: 'expired-application',
      source,
      sourceDid: did,
      subject: did,
      value: 'frequently-updated',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-02T00:00:00Z',
      negated: false,
    }
    const active: LabelEvent = {
      ...expired,
      id: 'active-application',
      createdAt: '2026-09-03T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    }

    const history = groupLabelHistory([expired, active])
    expect(history).toEqual([expect.objectContaining({ id: 'active-application' })])
    renderWithRouter(<LabelRow label={history[0]!} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })
})

describe('labeled post previews', () => {
  it('merges labels from duplicate posts in newest-first order', () => {
    const post: FeedPost = {
      kind: 'post',
      uri: `at://${did}/app.bsky.feed.post/labeled-merge`,
      author: actorReference,
      createdAt: '2026-04-01T00:00:00Z',
      text: 'A labeled post',
      facets: [],
    }
    const olderLabel: LabelEvent = {
      kind: 'labelEvent',
      id: 'older-label',
      source: actorReference,
      sourceDid: did,
      subject: post.uri,
      value: 'old',
      createdAt: '2026-04-02T00:00:00Z',
      negated: false,
    }
    const newerLabel: LabelEvent = { ...olderLabel, id: 'newer-label', value: 'new', createdAt: '2026-04-03T00:00:00Z' }
    const items: LabeledPost[] = [
      { kind: 'labeledPost', post, labels: [olderLabel] },
      { kind: 'labeledPost', post, labels: [olderLabel, newerLabel] },
    ]

    expect(mergeLabeledPosts(items)).toEqual([expect.objectContaining({ post, labels: [newerLabel, olderLabel] })])
  })

  it('uses the compact feed row with its author, media, and every label', () => {
    const postUri = `at://${did}/app.bsky.feed.post/labeled` as const
    const author = actorReference
    const post: FeedPost = {
      kind: 'post',
      uri: postUri,
      author,
      createdAt: '2026-04-01T00:00:00Z',
      text: 'A compact labeled post',
      facets: [],
      replyTo: `at://${did}/app.bsky.feed.post/parent`,
      images: [{ cid, alt: 'Compact attachment' }],
    }
    const label = (value: string): LabelEvent => ({
      kind: 'labelEvent',
      id: value,
      source: author,
      sourceDid: did,
      subject: postUri,
      value,
      createdAt: '2026-04-02T00:00:00Z',
      negated: false,
    })
    renderWithRouter(
      <LabeledPostRow
        item={{ kind: 'labeledPost', post, labels: [label('graphic-media'), label('photography')] }}
        displayNames={new Map([['graphic-media', 'Graphic Media']])}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Post labels' })).toBeInTheDocument()
    expect(screen.getByText('Graphic Media')).toHaveAttribute('title', 'Raw label: graphic-media')
    expect(screen.getByText('photography')).toBeInTheDocument()
    expect(screen.getByText('Reply to a public post')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Compact attachment' })).toBeInTheDocument()
  })
})
