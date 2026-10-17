import { HomePage } from '../src/pages/HomePage'
import { queryKeys } from '../src/data/queryKeys'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AccountDetails } from '../src/components/profile/AccountDetails'
import { ProfileTabsNav } from '../src/components/profile/ProfileTabsNav'
import { AppLayout } from '../src/layouts/AppLayout'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
import { PublicDataService } from '../src/data/publicData'
import { createTestQueryClient } from './testUtils'

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
afterEach(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

it('requests history only after expansion and retains it on reopening', async () => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const load = vi.fn(async () => ({ aliases: ['at://old.example'], formerHandles: [] }))
  const options = service.actors.accountDetailsQueryOptions('did:plc:example')
  vi.spyOn(service.actors, 'accountDetailsQueryOptions').mockImplementation(() => ({
    ...options,
    queryFn: load,
  }))
  render(
    <QueryClientProvider client={client}>
      <AccountDetails
        identity={{ kind: 'actorIdentity', did: 'did:plc:example', handle: 'example.com', pds: 'https://pds.example' }}
        service={service}
      />
    </QueryClientProvider>,
  )
  expect(load).not.toHaveBeenCalled()
  const details = screen.getByText('Account details').closest('details')!
  act(() => {
    details.open = true
    fireEvent(details, new Event('toggle'))
  })
  await waitFor(() => expect(screen.getByText('@old.example')).toBeVisible())
  act(() => {
    details.open = false
    fireEvent(details, new Event('toggle'))
  })
  act(() => {
    details.open = true
    fireEvent(details, new Event('toggle'))
  })
  expect(screen.getByText('@old.example')).toBeVisible()
  expect(load).toHaveBeenCalledTimes(1)
})

it('scrolls the active tab on navigation and count changes', () => {
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scroll })
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const view = render(
    <MemoryRouter initialEntries={['/profile/example.com']}>
      <ProfileTabsNav actor="example.com" />
    </MemoryRouter>,
  )
  expect(scroll.mock.calls.at(-1)?.[0].left).toBeGreaterThan(0)
  scroll.mockClear()
  fireEvent.click(screen.getByRole('link', { name: 'Blocked' }))
  expect(scroll).toHaveBeenCalledTimes(1)
  view.rerender(
    <MemoryRouter>
      <ProfileTabsNav actor="example.com" blockedCount={12} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Blocked (12)' })).toHaveAttribute('aria-current', 'page')
  expect(scroll).toHaveBeenCalledTimes(2)
})

it('resets new navigation, restores saved positions, and scrolls to hash targets', async () => {
  let position = 0
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => position)
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation((_left, top) => {
    position = top ?? 0
  })
  const router = createMemoryRouter(
    [{ element: <AppLayout />, children: [{ path: '/profile/:actor/:tab?', element: <h1 id="details">Details</h1> }] }],
    { initialEntries: ['/profile/example.com'] },
  )
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  scroll.mockClear()
  position = 240
  await act(() => router.navigate('/profile/example.com/blocking'))
  expect(scroll).toHaveBeenLastCalledWith(0, 0)
  position = 480
  await act(() => router.navigate(-1))
  expect(scroll).toHaveBeenLastCalledWith(0, 240)
  await act(() => router.navigate(1))
  expect(scroll).toHaveBeenLastCalledWith(0, 480)
  const details = screen.getByRole('heading', { name: 'Details' })
  await act(() => router.navigate('/profile/example.com/blocking#details'))
  expect(details.scrollIntoView).toHaveBeenCalledOnce()
})

it('updates the browser title between profile tabs and restores it on the homepage', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  const client = createTestQueryClient()
  client.setQueryData(queryKeys.profileView('example.com'), {
    kind: 'actorProfile',
    identity: { kind: 'actorIdentity', did: 'did:plc:example', handle: 'example.com', pds: 'https://pds.example' },
    hasNoUnauthenticatedSelfLabel: false,
  })
  function Navigation() {
    const navigate = useNavigate()
    return <button onClick={() => navigate('/')}>Home</button>
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile/example.com']}>
        <Navigation />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/profile/:actor/*" element={<ProfileLayout />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(document.title).toBe('@example.com — Feed — SkyTrace'))
  fireEvent.click(screen.getByRole('link', { name: 'Account labels' }))
  expect(document.title).toBe('@example.com — Account labels — SkyTrace')
  fireEvent.click(screen.getByText('Home'))
  expect(document.title).toBe('SkyTrace — Explore Bluesky blocks, labels, lists, and posts')
})
