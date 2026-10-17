import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LabelRow } from '../src/components/labels/LabelRow'
import { groupLabelHistory } from '../src/lib/labels/history'
import { LabeledPostRow } from '../src/components/labels/LabeledPostRow'
import { PublicDataService } from '../src/data/publicData'
import type { FeedPost, LabelEvent } from '../src/types'
import { createTestQueryClient } from './testUtils'
import { did, actorReference } from './actorFixtures'
import { renderWithRouter } from './profileTestUtils'

describe('account labels', () => {
  it('renders the source DID and preserves negated label history', () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const label: LabelEvent = {
      kind: 'labelEvent',
      id: 'label-event',
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

  it('updates a visible label at expiration and handles a replacement expiration', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const label = (expiresAt: string): LabelEvent => ({
      kind: 'labelEvent',
      id: expiresAt,
      sourceDid: did,
      subject: did,
      value: 'test-label',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt,
      negated: false,
    })

    const activeView = renderWithRouter(<LabelRow label={label('2026-01-01T00:00:01Z')} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Expires /)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getAllByText('Expired')[0]).toBeInTheDocument()
    expect(screen.getByLabelText(/^Expired /)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Expires /)).not.toBeInTheDocument()
    const laterExpiration = '2027-01-01T00:00:00Z'
    activeView.rerender(<LabelRow label={label(laterExpiration)} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2_147_483_647))
    expect(screen.getByText('Active')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(Date.parse(laterExpiration) - Date.now()))
    expect(screen.getAllByText('Expired')[0]).toBeInTheDocument()
  })

  it('pairs an applied label with its removal date', () => {
    const added: LabelEvent = {
      kind: 'labelEvent',
      id: 'added',
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
})

describe('labeled post previews', () => {
  it('shows every post label with its custom name', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T00:00:00Z'))
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
      sourceDid: did,
      subject: postUri,
      value,
      createdAt: '2026-04-02T00:00:00Z',
      expiresAt: '2026-04-02T00:00:01Z',
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
    expect(screen.queryByText('Expired')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getAllByText('Expired')).toHaveLength(2)
  })
})
