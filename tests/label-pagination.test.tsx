import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { LabelHistoryDataService } from '../src/data/labels/labelHistoryData'
import { profile } from './actorFixtures'
import { renderProfileTab } from './profileTestUtils'
import { AccountLabelsPage } from '../src/pages/profile/AccountLabelsPage'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import type { LabelPagingState } from '../src/data/labels/labelPaging'
import type { LabelEvent } from '../src/types'
import { createTestQueryClient } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const key = queryKeys.profileTab(did, 'labels')
const cursor: LabelPagingState = {
  kind: 'labels',
  did,
  appViewDone: true,
  providers: [],
}
const cached = { kind: 'unavailable' as const, id: 'cached', reason: 'Cached label row' }

function setup(options: { cached?: boolean; issues?: string[] } = { cached: true }) {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const observers = new Set<object>()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {
        observers.add(this)
      }
      disconnect() {
        observers.delete(this)
      }
    },
  )
  if (options.cached)
    client.setQueryData(key, {
      pages: [
        { items: [cached], cursor },
        { items: [], cursor, issues: options.issues },
      ],
      pageParams: [undefined, cursor],
    })
  const load = vi.spyOn(service.labelHistory, 'page')
  function mount() {
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Routes>
            <Route element={<Outlet context={{ profile: { identity: { did } }, service }} />}>
              <Route index element={<AccountLabelsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }
  return { client, load, mount, observers }
}

it('pauses pagination during refresh, retains cached labels after failure, and retries from the first page', async () => {
  const { client, load, mount, observers } = setup()
  let reject!: (error: Error) => void
  load
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    .mockResolvedValue({ items: [cached] })
  mount()
  expect(observers.size).toBe(1)
  await act(async () => {
    void client.invalidateQueries({ queryKey: key })
  })
  await waitFor(() => expect(observers.size).toBe(0))
  expect(screen.getByText('Cached label row')).toBeVisible()
  await act(async () => reject(new Error('Refresh failed')))
  expect(await screen.findByText("Couldn't refresh account labels")).toBeVisible()
  expect(screen.getByText('Cached label row')).toBeVisible()
  expect(observers.size).toBe(0)
  expect(load).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.queryByText("Couldn't refresh account labels")).not.toBeInTheDocument())
  expect(load.mock.calls.map((call) => call[1])).toEqual([undefined, undefined])
})

it('keeps the detailed initial error and loading announcement', async () => {
  const { load, mount } = setup({ cached: false })
  let reject!: (error: Error) => void
  load.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  mount()
  expect(screen.getByRole('status')).toHaveTextContent('Loading public records')
  await act(async () => reject(new Error('Label service explanation')))
  expect(await screen.findByText('Label service explanation')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.queryByText('No account labels found')).not.toBeInTheDocument()
})

it('pauses for source issues and retries the next page with its cursor', async () => {
  const { load, mount, observers } = setup({ cached: true, issues: ['did:plc:provider'] })
  load.mockResolvedValue({ items: [{ kind: 'unavailable', id: 'recovered', reason: 'Recovered source' }] })
  mount()
  expect(screen.getByText('1 source unavailable')).toBeVisible()
  expect(observers.size).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Recovered source')).toBeVisible()
  expect(screen.queryByText('1 source unavailable')).not.toBeInTheDocument()
  expect(load).toHaveBeenCalledTimes(1)
  expect(load.mock.calls[0][1]).toEqual(cursor)
})

it('orders mixed pages and shows one row for repeated labels and unavailable records', async () => {
  const { client, load, mount } = setup({ cached: false })
  const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
  client.setQueryData(queryKeys.labelDefinitions(sourceDid), [])
  client.setQueryData(queryKeys.profileView(sourceDid), {
    kind: 'actorProfile',
    identity: { kind: 'actorIdentity', did: sourceDid, handle: 'labeler.example', pds: 'https://pds.example' },
    hasNoUnauthenticatedSelfLabel: false,
  })
  const event: LabelEvent = {
    kind: 'labelEvent' as const,
    id: 'shared-event',
    sourceDid,
    subject: did,
    value: 'shared-label',
    createdAt: '2026-01-01T00:00:00Z',
    negated: false,
  }
  const newer = { ...event, id: 'newer', value: 'newer-label', createdAt: '2026-02-01T00:00:00Z' }
  const older = { ...event, id: 'older', value: 'older-label', createdAt: '2025-12-01T00:00:00Z' }
  load
    .mockResolvedValueOnce({ items: [cached, event, newer], cursor })
    .mockResolvedValueOnce({ items: [older, event, cached] })
  mount()
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(client.getQueryData<{ pages: unknown[] }>(key)?.pages).toHaveLength(2))
  expect(screen.getAllByText('shared-label')).toHaveLength(1)
  const rows = screen.getAllByRole('article')
  expect(rows[0]).toHaveTextContent('newer-label')
  expect(rows[1]).toHaveTextContent('shared-label')
  expect(rows[2]).toHaveTextContent('older-label')
  expect(screen.getAllByText('Cached label row')).toHaveLength(1)
  expect(
    rows[2].compareDocumentPosition(screen.getByText('Cached label row')) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

describe('account label eager pagination', () => {
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
      providers: [],
    }
    const labels = vi
      .spyOn(LabelHistoryDataService.prototype, 'page')
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
})
