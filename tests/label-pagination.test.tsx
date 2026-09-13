import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { LabelsTab } from '../src/pages/LabelsTab'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import type { LabelPagingState } from '../src/data/labelPaging'
import { createTestQueryClient } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const key = queryKeys.profileTab(did, 'labels')
const cursor: LabelPagingState = {
  kind: 'labels',
  did,
  relayDone: true,
  seenRelayCursors: [],
  providers: [],
  emittedIds: [],
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
  const load = vi.spyOn(service, 'labels')
  function mount() {
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Routes>
            <Route element={<Outlet context={{ profile: { identity: { did } }, service }} />}>
              <Route index element={<LabelsTab />} />
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
