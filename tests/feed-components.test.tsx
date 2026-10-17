import { mergeFeedItems } from '../src/data/posts/feedData'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedRow } from '../src/components/feed/FeedRow'
import { BlockRow } from '../src/components/blocks/BlockRow'
import { queryKeys } from '../src/data/queryKeys'
import { PublicDataService } from '../src/data/publicData'
import type { FeedPost } from '../src/types'
import { createTestQueryClient, jsonResponse as response } from './testUtils'
import { did, cid, identity, profile, actorReference } from './actorFixtures'

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
          <BlockRow
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
      avatarCid: cid,
      identity: { ...identity, did: originalDid, handle: 'original.example' },
    })
    const service = new PublicDataService(queryClient)
    const postOptions = service.posts.feedPostQueryOptions.bind(service.posts)
    const load = vi.spyOn(service.posts, 'feedPostQueryOptions').mockImplementation((uri) => ({
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
    expect(view.container.querySelector(`img[src*="${originalDid}"]`)).toHaveAttribute('alt', '')
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

  it('shows quote loading and failure inside the post, with its record menu', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.profileView(originalDid), {
      ...profile,
      identity: { ...identity, did: originalDid },
    })
    const service = new PublicDataService(queryClient)
    let resolveQuote!: (item: import('../src/types').UnavailableItem) => void
    const options = service.posts.feedPostQueryOptions(post.quoteUri!)
    vi.spyOn(service.posts, 'feedPostQueryOptions').mockReturnValue({
      ...options,
      queryFn: () =>
        new Promise<import('../src/types').UnavailableItem>((resolve) => {
          resolveQuote = resolve
        }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FeedRow item={post} service={service} footer={<span>Footer after quote</span>} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Loading quoted post…')).toBeVisible()
    await act(async () => resolveQuote({ kind: 'unavailable', id: post.quoteUri!, reason: 'Quote deleted' }))
    expect(await screen.findByText('Quote deleted')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open links for unavailable record' })).toBeVisible()
    expect(screen.getByText('Footer after quote')).toBeVisible()
  })

  it('keeps both record menus when the repost target is unavailable', async () => {
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    const postOptions = service.posts.feedPostQueryOptions(post.uri)
    vi.spyOn(service.posts, 'feedPostQueryOptions').mockReturnValue({
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
