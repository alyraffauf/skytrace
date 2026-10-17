import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { FeedRow } from '../src/components/feed/FeedRow'
import { QuotedPostPreview } from '../src/components/feed/QuotedPostPreview'
import { queryKeys } from '../src/data/queryKeys'
import { PublicDataService } from '../src/data/publicData'
import type { FeedPost } from '../src/types'
import { createTestQueryClient } from './testUtils'
import { did, cid, identity, profile, actorReference } from './actorFixtures'

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
    video: {
      cid,
      alt: 'Original video',
      captions: [
        { cid, lang: 'en' },
        { cid, lang: 'fr' },
      ],
    },
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
    const video = screen.getAllByLabelText('Original video')[0]
    expect(video).toHaveAttribute('crossorigin', 'anonymous')
    const tracks = video.querySelectorAll('track')
    expect([...tracks].map((track) => track.srclang)).toEqual(['en', 'fr'])
    for (const track of tracks) {
      expect(track).toHaveAttribute('kind', 'captions')
      expect(track.src).toContain('https://original-pds.example/')
      expect(new URL(track.src).searchParams.get('did')).toBe(originalDid)
      expect(new URL(track.src).searchParams.get('cid')).toBe(cid)
    }
    expect(load.mock.calls.every(([uri]) => uri === post.uri || uri === post.quoteUri)).toBe(true)
  })

  it.each(['unavailable', 'rejected'])('shows quote loading and %s failure inside the post', async (outcome) => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(queryKeys.profileView(originalDid), {
      ...profile,
      identity: { ...identity, did: originalDid },
    })
    const service = new PublicDataService(queryClient)
    let resolveQuote!: (item: import('../src/types').UnavailableItem) => void
    let rejectQuote!: (error: Error) => void
    const options = service.posts.feedPostQueryOptions(post.quoteUri!)
    vi.spyOn(service.posts, 'feedPostQueryOptions').mockReturnValue({
      ...options,
      queryFn: () =>
        new Promise<import('../src/types').UnavailableItem>((resolve, reject) => {
          resolveQuote = resolve
          rejectQuote = reject
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
    await act(async () => {
      if (outcome === 'rejected') rejectQuote(new Error('Quote query failed'))
      else resolveQuote({ kind: 'unavailable', id: post.quoteUri!, reason: 'Quote deleted' })
    })
    expect(
      await screen.findByText(outcome === 'rejected' ? 'This post could not be loaded.' : 'Quote deleted'),
    ).toBeVisible()
    expect(screen.queryByText('Loading quoted post…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open links for unavailable record' })).toBeVisible()
    expect(screen.getByText('Footer after quote')).toBeVisible()
  })

  it.each(['unavailable', 'rejected'])('keeps both record menus when the repost target is %s', async (outcome) => {
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    const postOptions = service.posts.feedPostQueryOptions(post.uri)
    vi.spyOn(service.posts, 'feedPostQueryOptions').mockReturnValue({
      ...postOptions,
      queryFn: async () => {
        if (outcome === 'rejected') throw new Error('Repost query failed')
        return { kind: 'unavailable', id: post.uri, reason: 'Target deleted' }
      },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FeedRow item={repost} service={service} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Loading reposted post…')).toBeVisible()
    expect(
      await screen.findByText(outcome === 'rejected' ? 'This post could not be loaded.' : 'Target deleted'),
    ).toBeVisible()
    expect(screen.queryByText('Loading reposted post…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /repost record/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /unavailable record/ })).toBeVisible()
  })

  it.each(['repost', 'quote'])('keeps cached %s content when refreshing fails', async (kind) => {
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileView(did), profile)
    client.setQueryData(queryKeys.profileView(originalDid), {
      ...profile,
      identity: { ...identity, did: originalDid },
    })
    const uri = kind === 'repost' ? post.uri : post.quoteUri!
    const key = queryKeys.feedPost(uri)
    client.setQueryData(key, { ...post, uri, quoteUri: undefined })
    const service = new PublicDataService(client)
    const options = service.posts.feedPostQueryOptions(uri)
    const load = vi.fn(async () => {
      throw new Error('Refresh failed')
    })
    vi.spyOn(service.posts, 'feedPostQueryOptions').mockReturnValue({ ...options, queryFn: load })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          {kind === 'repost' ? (
            <FeedRow item={repost} service={service} />
          ) : (
            <QuotedPostPreview uri={uri} service={service} />
          )}
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Original post body')).toBeVisible()
    await act(async () => {
      await client.refetchQueries({ queryKey: key })
    })
    expect(client.getQueryState(key)?.status).toBe('error')
    expect(screen.getByText('Original post body')).toBeVisible()
    expect(screen.queryByText('This post could not be loaded.')).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledOnce()
  })
})
