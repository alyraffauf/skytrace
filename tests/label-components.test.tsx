import { mergeLabeledPosts } from '../src/lib/posts/labeledPosts'
import { LabelDataService } from '../src/data/labels/labelData'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LabelRow } from '../src/components/labels/LabelRow'
import { groupLabelHistory } from '../src/lib/labels/history'
import { LabeledPostRow } from '../src/components/labels/LabeledPostRow'
import { labelDisplayName } from '../src/lib/labels/names'
import { labelDefinitionsFromRecord } from '../src/data/labels/definitionsParser'
import { AccountLabelsPage } from '../src/pages/profile/AccountLabelsPage'
import { PublicDataService } from '../src/data/publicData'
import type { FeedPost, LabeledPost, LabelEvent } from '../src/types'
import { createTestQueryClient } from './testUtils'
import { did, cid, profile, actorReference } from './actorFixtures'
import { renderWithRouter, renderProfileTab } from './profileTestUtils'

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
      appViewDone: false,
      seenAppViewCursors: [],
      providers: [],
    }
    const labels = vi
      .spyOn(LabelDataService.prototype, 'labels')
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
    renderProfileTab(<AccountLabelsPage />, profile)
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
      .spyOn(LabelDataService.prototype, 'labels')
      .mockResolvedValueOnce({
        items: [],
        cursor: {
          kind: 'labels',
          did,
          appViewDone: false,
          seenAppViewCursors: [],
          providers: [],
        },
      })
      .mockResolvedValue({ items: [{ kind: 'unavailable', id: 'second', reason: 'Second label page' }] })
    renderProfileTab(<AccountLabelsPage />, profile)
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
    expect(screen.getByRole('link', { name: sourceDid })).toHaveAttribute(
      'href',
      `/profile/${encodeURIComponent(sourceDid)}`,
    )
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
      { kind: 'labeledPost', post: { ...post, uri: `${post.uri}-z` }, labels: [] },
      {
        kind: 'labeledPost',
        post: { ...post, uri: `${post.uri}-older`, createdAt: '2025-01-01T00:00:00Z' },
        labels: [],
      },
      { kind: 'labeledPost', post, labels: [olderLabel] },
      { kind: 'labeledPost', post, labels: [olderLabel, newerLabel] },
    ]

    expect(mergeLabeledPosts(items)).toEqual([
      expect.objectContaining({ post, labels: [newerLabel, olderLabel] }),
      items[0],
      items[1],
    ])
  })

  it('shows every post label with its custom name', () => {
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    const postUri = `at://${did}/app.bsky.feed.post/labeled` as const
    const author = actorReference
    const post: FeedPost = {
      kind: 'post',
      uri: postUri,
      author,
      createdAt: '2026-04-01T00:00:00Z',
      text: 'A compact labeled post',
      facets: [],
    }
    const label = (value: string): LabelEvent => ({
      kind: 'labelEvent',
      id: `event-${value}`,
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
        displayNames={new Map([['event-graphic-media', 'Custom warning']])}
        service={service}
      />,
      queryClient,
    )

    expect(screen.getByRole('heading', { name: 'Post labels' })).toBeInTheDocument()
    expect(screen.getByText('Custom warning')).toHaveAttribute('title', 'Raw label: graphic-media')
    expect(screen.getByText('photography')).toBeInTheDocument()
  })
})
