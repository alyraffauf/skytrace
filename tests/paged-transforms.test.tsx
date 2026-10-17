import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider, useIsFetching } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { RecordTab } from '../src/components/pagination/RecordTab'
import { ListMembers } from '../src/components/lists/ListMembers'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import * as labelHistory from '../src/lib/labels/history'
import * as labeledPosts from '../src/lib/posts/labeledPosts'
import * as sorting from '../src/lib/sorting'
import * as collections from '../src/lib/collections'
import { AccountLabelsPage } from '../src/pages/profile/AccountLabelsPage'
import { LabeledPostsPage } from '../src/pages/profile/LabeledPostsPage'
import { ListedOnPage } from '../src/pages/profile/ListedOnPage'
import type { LabeledPost, UnavailableItem } from '../src/types'
import { actorReference, did, profile } from './actorFixtures'
import { createTestQueryClient } from './testUtils'

function FetchStatus({ queryKey }: { queryKey: readonly unknown[] }) {
  const fetching = useIsFetching({ queryKey })
  return <output data-testid="fetching">{fetching}</output>
}

it.each(['labels', 'labeledPosts', 'records', 'listedOn', 'members'] as const)(
  'reuses the %s transform during refresh and recomputes when page contents change',
  async (mode) => {
    const client = createTestQueryClient()
    const service = new PublicDataService(client)
    const listUri = `at://${did}/app.bsky.graph.list/test`
    const membershipUri = `at://${did}/app.bsky.graph.listitem/test`
    let queryKey: readonly unknown[] = queryKeys.profileTab(did, mode)
    if (mode === 'labeledPosts') queryKey = queryKeys.labeledPosts(did)
    if (mode === 'members') queryKey = queryKeys.listMembers(listUri)
    client.setQueryData(queryKey, { pages: [{ items: [] }], pageParams: [undefined] })
    client.setQueryData(queryKeys.profileView(did), profile)
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const unavailable: UnavailableItem = { kind: 'unavailable', id: 'loaded', reason: 'Loaded row' }
    const refreshRecords = vi.fn(async () => {
      await pending
      return { items: [unavailable] }
    })
    const post: LabeledPost = {
      kind: 'labeledPost',
      post: {
        kind: 'post',
        uri: `at://${did}/app.bsky.feed.post/loaded`,
        author: actorReference,
        createdAt: '2026-01-01T00:00:00Z',
        text: 'Loaded row',
        facets: [],
      },
      labels: [],
    }
    let element
    let transform
    if (mode === 'labels') {
      vi.spyOn(service.labelHistory, 'page').mockImplementation(refreshRecords)
      transform = vi.spyOn(labelHistory, 'groupLabelHistory')
      element = <AccountLabelsPage />
    } else if (mode === 'labeledPosts') {
      vi.spyOn(service.labeledPosts, 'page').mockImplementation(async () => {
        await pending
        return { items: [post] }
      })
      transform = vi.spyOn(labeledPosts, 'mergeLabeledPosts')
      element = <LabeledPostsPage />
    } else if (mode === 'listedOn' || mode === 'members') {
      const refreshReferences = async () => {
        await pending
        return { items: [{ uri: membershipUri }, { uri: membershipUri }] }
      }
      transform = vi.spyOn(collections, 'dedupeBy')
      if (mode === 'listedOn') {
        client.setQueryData(queryKeys.listedOnMembership(membershipUri, did), unavailable)
        vi.spyOn(service.lists, 'listedOnReferences').mockImplementation(refreshReferences)
        element = <ListedOnPage />
      } else {
        client.setQueryData(queryKeys.listMember(listUri, membershipUri), unavailable)
        vi.spyOn(service.lists, 'listMembers').mockImplementation(refreshReferences)
        element = <ListMembers listUri={listUri} lists={service.lists} />
      }
    } else {
      transform = vi.spyOn(sorting, 'newestFirst')
      element = (
        <RecordTab<UnavailableItem>
          queryKey={queryKey}
          resourceLabel="records"
          emptyTitle="No records"
          load={refreshRecords}
          itemKey={(item) => item.id}
          renderItem={(item) => <p>{item.reason}</p>}
        />
      )
    }
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FetchStatus queryKey={queryKey} />
          <Routes>
            <Route element={<Outlet context={{ profile, service }} />}>
              <Route index element={element} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(transform).toHaveBeenCalledOnce()
    await act(async () => {
      void client.refetchQueries({ queryKey })
    })
    await waitFor(() => expect(screen.getByTestId('fetching')).toHaveTextContent('1'))
    expect(transform).toHaveBeenCalledOnce()
    await act(async () => finish())
    expect(await screen.findByText('Loaded row')).toBeVisible()
    await waitFor(() => expect(screen.getByTestId('fetching')).toHaveTextContent('0'))
    expect(transform).toHaveBeenCalledTimes(2)
    if (mode === 'listedOn') {
      await act(async () => {
        client.setQueryData(queryKeys.listedOnMembership(membershipUri, did), { ...unavailable, reason: 'Updated row' })
      })
      expect(await screen.findByText('Updated row')).toBeVisible()
      expect(transform).toHaveBeenCalledTimes(2)
    }
  },
)
