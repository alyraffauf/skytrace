import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
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
  const status = screen.getByRole('status', { name: 'Account search' })
  expect(status).toBeEmptyDOMElement()
  fireEvent.change(input, { target: { value: ' @at ' } })
  await advance(179)
  expect(fetch).not.toHaveBeenCalled()
  await advance(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('q')).toBe('at')
  expect(status).toHaveTextContent('Searching...')
  await act(async () => resolve(jsonResponse({ actors })))
  await advance(1)
  expect(screen.getAllByRole('option')).toHaveLength(2)
  expect(screen.getByRole('status', { name: 'Account search' })).toBe(status)
  expect(status).toHaveTextContent('2 account suggestions')
  fireEvent.change(input, { target: { value: 'zz' } })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(status).toBeEmptyDOMElement()
  await advance()
  expect(status).toHaveTextContent('Searching...')
  await act(async () => resolve(jsonResponse({ actors: [] })))
  await advance(1)
  expect(screen.getByRole('status', { name: 'Account search' })).toBe(status)
  expect(status).toHaveTextContent('No matching accounts')
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

it('navigates to the selected suggestion DID on Enter', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
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
  fireEvent.click(option)
  expect(input).toHaveFocus()
  expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${encodeURIComponent(actors[1].did)}`)
})

it('submits the typed query after blur and refocus instead of an old highlighted suggestion', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'atproto.com' } })
  await advance()
  await advance(1)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
  act(() => screen.getByRole('button', { name: 'Outside' }).focus())
  act(() => input.focus())
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/profile\/atproto\.com$/)
})

it('does not carry an ArrowDown highlight from hidden stale suggestions into new results', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ actors }))
      .mockResolvedValueOnce(jsonResponse({ actors: [actors[1]] })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  expect(screen.getAllByRole('option')).toHaveLength(2)

  fireEvent.change(input, { target: { value: 'another.example' } })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  await advance()
  await advance(1)
  expect(screen.getAllByRole('option')).toHaveLength(1)
  expect(input).not.toHaveAttribute('aria-activedescendant')

  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/profile\/another\.example$/)
})

it('validates direct form submissions and navigates without suggestions', () => {
  const input = setup()
  fireEvent.change(input, { target: { value: 'not a handle' } })
  fireEvent.submit(input.closest('form')!)
  expect(screen.getByRole('alert')).toBeVisible()
  fireEvent.change(input, { target: { value: 'https://bsky.app/profile/atproto.com' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Explore profile' }))
  expect(screen.getByTestId('location')).toHaveTextContent('/profile/atproto.com')
})

it('keeps IME Enter in the input instead of submitting a profile', () => {
  const input = setup()
  fireEvent.change(input, { target: { value: 'atproto.com' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
})

it('dismisses suggestions with Escape and reopens them without losing the query', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Account search' })).toBeEmptyDOMElement()
  expect(input).toHaveValue('at')
  expect(input).toHaveFocus()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(screen.getByRole('listbox')).toBeVisible()
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
