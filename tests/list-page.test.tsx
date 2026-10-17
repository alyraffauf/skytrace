import { ListDataService } from '../src/data/graph/listData'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '../src/data/queryKeys'
import { ListPage } from '../src/pages/ListPage'
import type { ListSummary } from '../src/types'
import { createTestQueryClient, jsonResponse as response } from './testUtils'
import { did, identity, profile, actorReference } from './actorFixtures'

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
    expect(document.title).toBe('Test list — SkyTrace')
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

  it('shows loading and the initial error without showing an empty result', async () => {
    let reject!: (error: Error) => void
    vi.spyOn(ListDataService.prototype, 'listMembers').mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    renderMembers()
    expect(screen.getByLabelText('Loading')).toBeVisible()
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
      .spyOn(ListDataService.prototype, 'listMembers')
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
