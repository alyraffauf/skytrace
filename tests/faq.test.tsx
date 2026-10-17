import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FaqPage } from '../src/pages/FaqPage'

it('omits opt-out and minimum discussion when disabled without fetching account data', () => {
  vi.stubGlobal('__SKYTRACE_CONFIG__', { ignoreNoUnauthenticated: false, blockTargetDid: null, minListBlocking: null })
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<FaqPage />)
  expect(screen.queryByRole('heading', { name: 'How do I opt out?' })).not.toBeInTheDocument()
  expect(screen.queryByText(/This opt-out controls/)).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: "SkyTrace's Bluesky account" })).not.toBeInTheDocument()
  expect(screen.queryByText(/minimum|blocker count|created equal/i)).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('explains the configured opt-out account and active minimum', () => {
  const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
  vi.stubGlobal('__SKYTRACE_CONFIG__', { ignoreNoUnauthenticated: false, blockTargetDid: did, minListBlocking: 0 })
  render(<FaqPage />)
  expect(screen.getByRole('heading', { name: 'How do I opt out?' })).toHaveAttribute('id', 'opt-out')
  expect(screen.getByRole('link', { name: "SkyTrace's Bluesky account" })).toHaveAttribute(
    'href',
    `https://bsky.app/profile/${did}`,
  )
  expect(screen.getByText(/at least 0 accounts block/)).toBeVisible()
  expect(screen.getByText(/The minimum applies only/)).toBeVisible()
  expect(screen.getByText(/This opt-out controls/)).toBeVisible()
  expect(screen.queryByText(/Block-to-opt-out is currently disabled/)).not.toBeInTheDocument()
  expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument()
})
