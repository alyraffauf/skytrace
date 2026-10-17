import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryKeys } from '../src/data/queryKeys'
import { ActorSearch } from '../src/components/actors/ActorSearch'
import { createTestQueryClient, jsonResponse } from './testUtils'

const actors = [
  { did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz', handle: 'atproto.com', displayName: 'AT Protocol' },
  { did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'another.example', displayName: 'Another account' },
]

function setup(client = createTestQueryClient()) {
  vi.useFakeTimers()
  function Location() {
    return <div data-testid="location">{useLocation().pathname}</div>
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActorSearch />
        <Location />
        <button>Outside</button>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const input = screen.getByRole('combobox')
  act(() => input.focus())
  return input
}
async function advance(ms = 180) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

it('debounces normalized input, hides stale results, and displays loading and empty states', async () => {
  let resolve!: (response: Response) => void
  const fetch = vi.fn(
    (_input: RequestInfo | URL) =>
      new Promise<Response>((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const input = setup()
  fireEvent.change(input, { target: { value: ' @at ' } })
  await advance(179)
  expect(fetch).not.toHaveBeenCalled()
  await advance(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('q')).toBe('at')
  expect(screen.getByRole('status')).toHaveTextContent('Searching...')
  await act(async () => resolve(jsonResponse({ actors })))
  await advance(1)
  expect(screen.getAllByRole('option')).toHaveLength(2)
  fireEvent.change(input, { target: { value: 'zz' } })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await advance()
  expect(screen.getByRole('status')).toHaveTextContent('Searching...')
  await act(async () => resolve(jsonResponse({ actors: [] })))
  await advance(1)
  expect(screen.getByRole('status')).toHaveTextContent('No matching accounts')
})

it.each(['a', 'did:plc:example', 'https://bsky.app/profile/atproto.com'])('does not suggest for %s', async (value) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const input = setup()
  fireEvent.change(input, { target: { value } })
  await advance()
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('uses default keyboard navigation, dismisses on Escape, and selects by DID', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  const options = screen.getAllByRole('option')
  fireEvent.keyDown(input, { key: 'End' })
  expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(input).toHaveValue('at')
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'End' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${encodeURIComponent(actors[1].did)}`)
  expect(input).toHaveValue('@another.example')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('selects by pointer without moving input focus and dismisses on blur', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  act(() => screen.getByText('Outside').focus())
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  act(() => input.focus())
  await advance(20)
  const option = screen.getAllByRole('option')[1]
  fireEvent.mouseDown(option, { button: 0 })
  expect(input).toHaveFocus()
  expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${encodeURIComponent(actors[1].did)}`)
})

it('validates direct form submissions and navigates without suggestions', () => {
  const input = setup()
  fireEvent.change(input, { target: { value: 'not a handle' } })
  fireEvent.submit(input.closest('form')!)
  expect(screen.getByRole('alert')).toBeVisible()
  fireEvent.change(input, { target: { value: 'https://bsky.app/profile/atproto.com' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.submit(input.closest('form')!)
  expect(screen.getByTestId('location')).toHaveTextContent('/profile/atproto.com')
})

it('handles changing cached results without retaining a removed option', async () => {
  const client = createTestQueryClient()
  const key = queryKeys.actorSuggestions('at')
  client.setQueryData(key, actors)
  const input = setup(client)
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  fireEvent.keyDown(input, { key: 'End' })
  const removedId = screen.getAllByRole('option')[1].id
  client.setQueryData(key, actors.slice(0, 1))
  await advance(1)
  expect(input).not.toHaveAttribute('aria-activedescendant', removedId)
  client.setQueryData(key, [])
  await advance(1)
  expect(input).not.toHaveAttribute('aria-activedescendant')
  expect(screen.getByRole('status')).toHaveTextContent('No matching accounts')
  client.setQueryData(key, actors)
  await advance(1)
  fireEvent.keyDown(input, { key: 'Home' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${encodeURIComponent(actors[0].did)}`)
})

it('keeps keyboard navigation in the input and leaves page scrolling unlocked', async () => {
  const client = createTestQueryClient()
  client.setQueryData(queryKeys.actorSuggestions('at'), actors)
  const input = setup(client)
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  fireEvent.keyDown(input, { key: 'End' })
  await advance(20)
  expect(input).toHaveFocus()
  expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
  expect(document.documentElement.style.overflow).not.toBe('hidden')
})

it.each(['atproto.com', 'did:plc:ewvi7nxzyoun6zhxrhs64oiz', 'https://bsky.app/profile/atproto.com'])(
  'submits %s on Enter before suggestions are available',
  (value) => {
    const input = setup()
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const actor = value.startsWith('https:') ? 'atproto.com' : value
    expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${encodeURIComponent(actor)}`)
  },
)
