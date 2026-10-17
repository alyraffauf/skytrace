import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RelationshipRow } from '../src/components/records/RelationshipRow'
import { jsonResponse as response } from './testUtils'
import { did } from './actorFixtures'

describe('relationship rendering', () => {
  it('keeps the DID and external links when profile hydration fails', async () => {
    const unresolvedDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const fetchMock = vi.fn(async () => response({ error: 'UpstreamFailure' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RelationshipRow
            entry={{
              kind: 'relationship',
              id: `at://${did}/app.bsky.graph.block/3abc`,
              actor: { kind: 'actorReference', did: unresolvedDid },
            }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('link', { name: unresolvedDid })).toBeInTheDocument()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: unresolvedDid })).toBeInTheDocument()
    expect(screen.getByTitle(unresolvedDid)).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: `Open links for ${unresolvedDid}` }))
    expect(screen.getByRole('link', { name: /PDSls/ })).toHaveAttribute(
      'href',
      `https://pdsls.dev/at://${did}/app.bsky.graph.block/3abc`,
    )
    expect(screen.getByRole('link', { name: /Witchsky/ })).toHaveAttribute(
      'href',
      `https://witchsky.app/profile/${unresolvedDid}`,
    )
  })
})
