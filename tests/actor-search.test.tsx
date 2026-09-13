import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ActorSearch } from '../src/components/ActorSearch'
import { createTestQueryClient, jsonResponse } from './testUtils'

const actors = [
  { did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz', handle: 'atproto.com', displayName: 'AT Protocol' },
  { did: 'did:plc:abcdefghijklmnopqrstuvwx', handle: 'another.example', displayName: 'Another account' },
]

function setup() {
  vi.useFakeTimers()
  function Location() {
    return <div data-testid="location">{useLocation().pathname}</div>
  }
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <ActorSearch />
        <Location />
        <button>Outside</button>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
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
  expect(input).toHaveAttribute('aria-expanded', 'false')
})

it('supports arrow selection, Escape, reopening, and Enter navigation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  const options = screen.getAllByRole('option')
  expect(options[1]).toHaveAttribute('aria-selected', 'true')
  expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(options[0]).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.change(input, { target: { value: '@at' } })
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${actors[1].did}`)
  expect(input).toHaveValue('@another.example')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('protects input focus on pointer selection and hides suggestions on blur', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ actors })),
  )
  const input = setup()
  fireEvent.change(input, { target: { value: 'at' } })
  await advance()
  await advance(1)
  fireEvent.blur(input, { relatedTarget: screen.getByText('Outside') })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.focus(input)
  const option = screen.getAllByRole('option')[1]
  expect(fireEvent.pointerDown(option)).toBe(false)
  fireEvent.pointerMove(option)
  expect(option).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(option)
  expect(screen.getByTestId('location')).toHaveTextContent(`/profile/${actors[1].did}`)
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
