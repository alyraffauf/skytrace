import { PROFILE_TABS } from '../src/routes/profileTabs'
import { HomePage } from '../src/pages/HomePage'
import { queryKeys } from '../src/data/queryKeys'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AccountDetails } from '../src/components/profile/AccountDetails'
import { ProfileTabsNav } from '../src/components/profile/ProfileTabsNav'
import { AppLayout } from '../src/layouts/AppLayout'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
import { ProfileErrorState } from '../src/components/profile/ProfileErrorState'
import { PublicDataService } from '../src/data/publicData'
import { createTestQueryClient } from './testUtils'

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
afterEach(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

it('lets an unavailable account be retried or replaced with a new search', () => {
  const retry = vi.fn()
  render(
    <MemoryRouter initialEntries={['/profile/missing.example']}>
      <Routes>
        <Route path="/" element={<h1>Search for an account</h1>} />
        <Route
          path="/profile/:actor"
          element={<ProfileErrorState actor="missing.example" isRetrying={false} retry={retry} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Account unavailable', level: 1 })).toBeVisible()
  expect(screen.getByText(/missing\.example/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('link', { name: 'Back to search' }))
  expect(screen.getByRole('heading', { name: 'Search for an account' })).toBeVisible()
})

it('requests history only after expansion and retains it on reopening', async () => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const load = vi.fn(async () => ({
    aliases: ['at://EXAMPLE.com', 'at://old.example'],
    formerHandles: ['older.example'],
  }))
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
  expect(screen.queryByText('@EXAMPLE.com')).not.toBeInTheDocument()
  expect(screen.getByText('@older.example')).toBeVisible()
  expect(screen.getByText('Decentralized Identifier')).toBeVisible()
  expect(screen.getByText('did:plc:example')).toBeVisible()
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

it.each(['pending', 'error'])('keeps %s history messages outside the definition list', async (state) => {
  const client = createTestQueryClient()
  const service = new PublicDataService(client)
  const options = service.actors.accountDetailsQueryOptions('did:plc:example')
  vi.spyOn(service.actors, 'accountDetailsQueryOptions').mockImplementation(() => ({
    ...options,
    queryFn: async () => {
      if (state === 'error') throw new Error('History unavailable')
      await new Promise(() => {})
      return { aliases: [], formerHandles: [] }
    },
  }))
  render(
    <QueryClientProvider client={client}>
      <AccountDetails
        identity={{ kind: 'actorIdentity', did: 'did:plc:example', handle: 'example.com', pds: 'https://pds.example' }}
        service={service}
      />
    </QueryClientProvider>,
  )
  const details = screen.getByText('Account details').closest('details')!
  act(() => {
    details.open = true
    fireEvent(details, new Event('toggle'))
  })
  const message =
    state === 'pending'
      ? await screen.findByText('Loading identity history...')
      : await screen.findByText('Identity history unavailable.')
  expect(message).toBeVisible()
  expect(message.closest('dl')).toBeNull()
  expect(details).toContainElement(message)
})

it('keeps route tabs and counts synchronized with navigation', () => {
  const view = render(
    <MemoryRouter initialEntries={['/profile/example.com']}>
      <ProfileTabsNav actor="example.com" />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Feed' })).toHaveAttribute('aria-current', 'true')
  fireEvent.click(screen.getByRole('link', { name: 'Blocked' }))
  expect(screen.getByRole('link', { name: 'Blocked' })).toHaveAttribute('href', '/profile/example.com/blocking')
  expect(screen.getByRole('link', { name: 'Blocked' })).toHaveAttribute('aria-current', 'true')
  expect(screen.getByRole('link', { name: 'Feed' })).not.toHaveAttribute('aria-current')
  view.rerender(
    <MemoryRouter>
      <ProfileTabsNav actor="example.com" blockedCount={12} />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Blocked (12)' })).toHaveAttribute('aria-current', 'true')
})

it('keeps the selected tab visible when counts widen earlier tabs without moving page focus', () => {
  const tabs = (blockedCount?: number, blockedByCount?: number) => (
    <MemoryRouter initialEntries={['/profile/example.com/lists']}>
      <ProfileTabsNav actor="example.com" blockedCount={blockedCount} blockedByCount={blockedByCount} />
    </MemoryRouter>
  )
  const view = render(tabs())
  const selected = screen.getByRole('link', { name: 'Lists' })
  const strip = selected.parentElement!
  const initialScroll = 220
  strip.scrollLeft = initialScroll
  let selectedLeft = 280
  vi.spyOn(strip, 'getBoundingClientRect').mockImplementation(() => new DOMRect(12, 369, 351, 40))
  vi.spyOn(selected, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(selectedLeft - (strip.scrollLeft - initialScroll), 373, 56, 36),
  )
  const scroll = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
    this.scrollLeft = options.left ?? this.scrollLeft
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scroll })
  const scrollPage = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  act(() => selected.focus())
  scroll.mockClear()

  selectedLeft = 370
  view.rerender(tabs(349, 3242))
  expect(selected.getBoundingClientRect().right).toBeLessThanOrEqual(strip.getBoundingClientRect().right)
  expect(selected.getBoundingClientRect().left).toBeGreaterThanOrEqual(strip.getBoundingClientRect().left)
  expect(selected).toHaveFocus()
  expect(scrollPage).not.toHaveBeenCalled()
  expect(selected.scrollIntoView).not.toHaveBeenCalled()

  scroll.mockClear()
  view.rerender(tabs(349, 3243))
  expect(scroll).not.toHaveBeenCalled()
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
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage />, handle: { presentation: 'home' } },
          {
            path: 'profile/:actor',
            element: <ProfileLayout />,
            handle: { presentation: 'explorer' },
            children: PROFILE_TABS.map((tab) =>
              tab.id === 'feed'
                ? { index: true, element: null, handle: { profileTab: tab } }
                : { path: tab.id, element: null, handle: { profileTab: tab } },
            ),
          },
          { path: 'faq', element: <h1>FAQ</h1> },
        ],
      },
    ],
    { initialEntries: ['/profile/example.com'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await waitFor(() => expect(document.title).toBe('@example.com — Feed — SkyTrace'))
  expect(screen.getByRole('link', { name: 'SkyTrace' })).toBeVisible()
  expect(screen.getByRole('combobox')).toHaveAttribute('id', 'header-actor-search')
  for (const tab of PROFILE_TABS.slice(1)) {
    fireEvent.click(screen.getByRole('link', { name: tab.label }))
    expect(document.title).toBe(`@example.com — ${tab.label} — SkyTrace`)
  }
  await act(() => router.navigate('/faq'))
  expect(screen.getByRole('link', { name: 'SkyTrace' })).toBeVisible()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  await act(() => router.navigate('/'))
  expect(screen.queryByRole('link', { name: 'SkyTrace' })).not.toBeInTheDocument()
  expect(document.title).toBe('SkyTrace — Explore Bluesky blocks, labels, lists, and posts')
})
