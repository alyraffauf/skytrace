import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AccountDetails } from '../src/components/AccountDetails'
import { ProfileTabsNav } from '../src/components/ProfileTabsNav'
import { ProfilePage } from '../src/pages/ProfilePage'
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
  const options = service.accountDetailsQueryOptions('did:plc:example')
  vi.spyOn(service, 'accountDetailsQueryOptions').mockImplementation(() => ({
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

it('resets page scroll for pushes but leaves back and forward restoration alone', () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const client = createTestQueryClient()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
  function Navigation() {
    const navigate = useNavigate()
    return (
      <>
        <button onClick={() => navigate('/profile/example.com/blocking')}>Push</button>
        <button onClick={() => navigate(-1)}>Back</button>
        <button onClick={() => navigate(1)}>Forward</button>
      </>
    )
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile/example.com']}>
        <Navigation />
        <Routes>
          <Route path="/profile/:actor/*" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect(scroll).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Push'))
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0 })
  fireEvent.click(screen.getByText('Back'))
  fireEvent.click(screen.getByText('Forward'))
  expect(scroll).toHaveBeenCalledTimes(1)
})
