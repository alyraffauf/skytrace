import { LabeledPostsDataService } from '../src/data/posts/labeledPostsData'
import { FeedDataService } from '../src/data/posts/feedData'
import { LabelHistoryDataService } from '../src/data/labels/labelHistoryData'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { profileFromRecord } from '../src/data/actors/profileParser'
import { FeedPage } from '../src/pages/profile/FeedPage'
import { LabeledPostsPage } from '../src/pages/profile/LabeledPostsPage'
import { AccountLabelsPage } from '../src/pages/profile/AccountLabelsPage'
import type { ActorProfile } from '../src/types'
import { did, cid, identity, profile } from './actorFixtures'
import { renderProfileTab } from './profileTestUtils'

describe('profile post privacy', () => {
  const restrictedProfile: ActorProfile = { ...profile, hasNoUnauthenticatedSelfLabel: true }
  const unavailableExplanation = 'This account has chosen not to show its posts on public sites like SkyTrace.'

  it.each([
    ['Feed', <FeedPage />],
    ['Labeled posts', <LabeledPostsPage />],
  ])('keeps %s private when an unrelated profile field is invalid', (_tab, element) => {
    const malformedProfile = profileFromRecord(identity, {
      uri: `at://${did}/app.bsky.actor.profile/self`,
      cid,
      value: {
        $type: 'app.bsky.actor.profile',
        displayName: 42,
        labels: {
          $type: 'com.atproto.label.defs#selfLabels',
          values: [{ val: '!no-unauthenticated' }],
        },
      },
    })
    const feed = vi.spyOn(FeedDataService.prototype, 'feed')
    const labeledPosts = vi.spyOn(LabeledPostsDataService.prototype, 'page')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderProfileTab(element, malformedProfile)

    expect(screen.getByRole('heading', { name: "Posts aren't available here" })).toBeVisible()
    expect(feed).not.toHaveBeenCalled()
    expect(labeledPosts).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the privacy notice without requesting the feed', () => {
    const fetchMock = vi.fn()
    const feed = vi.spyOn(FeedDataService.prototype, 'feed')
    vi.stubGlobal('fetch', fetchMock)

    renderProfileTab(<FeedPage />, restrictedProfile)

    expect(screen.getByRole('heading', { name: "Posts aren't available here" })).toBeVisible()
    expect(screen.getByText(unavailableExplanation)).toBeVisible()
    expect(feed).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the privacy notice without requesting repositories or label relays', () => {
    const fetchMock = vi.fn()
    const labeledPosts = vi.spyOn(LabeledPostsDataService.prototype, 'page')
    vi.stubGlobal('fetch', fetchMock)

    renderProfileTab(<LabeledPostsPage />, restrictedProfile)

    expect(screen.getByRole('heading', { name: "Posts aren't available here" })).toBeVisible()
    expect(screen.getByText(unavailableExplanation)).toBeVisible()
    expect(labeledPosts).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps Account labels available for the same profile', async () => {
    const labels = vi.spyOn(LabelHistoryDataService.prototype, 'page').mockResolvedValue({ items: [] })

    renderProfileTab(<AccountLabelsPage />, restrictedProfile)

    expect(await screen.findByRole('heading', { name: 'No account labels found' })).toBeVisible()
    expect(labels).toHaveBeenCalledOnce()
  })

  it('loads both post tabs when the runtime override is enabled', async () => {
    vi.stubGlobal('__SKYTRACE_CONFIG__', { ignoreNoUnauthenticated: true })
    const feed = vi.spyOn(FeedDataService.prototype, 'feed').mockResolvedValue({ items: [] })
    const labeledPosts = vi.spyOn(LabeledPostsDataService.prototype, 'page').mockResolvedValue({ items: [] })

    const feedView = renderProfileTab(<FeedPage />, restrictedProfile)
    expect(await screen.findByRole('heading', { name: 'No posts or reposts found' })).toBeVisible()
    expect(feed).toHaveBeenCalledOnce()
    feedView.unmount()

    renderProfileTab(<LabeledPostsPage />, restrictedProfile)
    expect(await screen.findByRole('heading', { name: 'No labeled posts found' })).toBeVisible()
    expect(labeledPosts).toHaveBeenCalledOnce()
  })
})
