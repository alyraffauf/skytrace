import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { InfiniteScroll } from '../src/components/pagination/InfiniteScroll'
import { RecordTab } from '../src/components/pagination/RecordTab'
import type { Page } from '../src/types'
import { createTestQueryClient } from './testUtils'

describe('pagination utilities', () => {
  it('uses the latest load callback when an existing observer intersects', () => {
    let onIntersection!: IntersectionObserverCallback
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersection = callback
        }
        observe() {}
        disconnect = disconnect
      },
    )
    const firstLoad = vi.fn()
    const nextLoad = vi.fn(() => expect(disconnect).toHaveBeenCalled())
    const view = render(<InfiniteScroll hasMore loading={false} load={firstLoad} />)
    const originalCallback = onIntersection
    view.rerender(<InfiniteScroll hasMore loading={false} load={nextLoad} />)
    disconnect.mockClear()
    act(() => originalCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(firstLoad).not.toHaveBeenCalled()
    expect(nextLoad).toHaveBeenCalledOnce()
  })

  it('pauses automatic pagination after an error and offers a manual retry', () => {
    const load = vi.fn()
    const observe = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect() {}
      },
    )
    render(<InfiniteScroll hasMore loading={false} error={new Error('Page failed')} load={load} />)
    expect(observe).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(load).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more")
  })
})

it('disconnects when disabled or unmounted and rearms after cached page changes', () => {
  const observers: Array<{
    callback: IntersectionObserverCallback
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }> = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(public callback: IntersectionObserverCallback) {
        observers.push(this)
      }
    },
  )
  const load = vi.fn()
  const firstPage = {}
  const nextPage = {}
  const view = render(<InfiniteScroll hasMore loading={false} resetKey={firstPage} load={load} />)
  expect(observers).toHaveLength(1)
  expect(observers[0].observe).toHaveBeenCalledOnce()

  view.rerender(<InfiniteScroll hasMore loading={false} disabled resetKey={firstPage} load={load} />)
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  expect(observers).toHaveLength(1)

  view.rerender(<InfiniteScroll hasMore loading={false} resetKey={firstPage} load={load} />)
  expect(observers).toHaveLength(2)
  act(() => observers[1].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
  expect(observers[1].disconnect).toHaveBeenCalledOnce()
  expect(load).toHaveBeenCalledOnce()

  view.rerender(<InfiniteScroll hasMore loading={false} resetKey={nextPage} load={load} />)
  expect(observers).toHaveLength(3)
  expect(observers[2].observe).toHaveBeenCalledOnce()
  view.unmount()
  expect(observers[2].disconnect).toHaveBeenCalledOnce()
})

describe('generic record pagination cursors', () => {
  type Row = { kind: 'unavailable'; id: string; reason: string }
  type ServicePages = Record<string, readonly [row: string, nextCursor?: string]>

  /** Every observed sentinel reports itself visible, like a short list that never fills the viewport. */
  function stubAlwaysVisibleSentinel() {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private connected = true
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe() {
          queueMicrotask(() => {
            if (this.connected)
              this.callback(
                [{ isIntersecting: true } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver,
              )
          })
        }
        disconnect() {
          this.connected = false
        }
      },
    )
  }

  /** Serves the page for each requested cursor from a table of row name and next cursor. */
  function pagedService(pages: ServicePages) {
    return vi.fn(async (cursor: string | undefined): Promise<Page<Row>> => {
      const [row, nextCursor] = pages[cursor ?? 'first']!
      return { items: [{ kind: 'unavailable', id: row, reason: row }], cursor: nextCursor }
    })
  }

  function renderTab(client: QueryClient, queryKey: string, load: ReturnType<typeof pagedService>) {
    return (
      <QueryClientProvider client={client}>
        <RecordTab<Row>
          queryKey={[queryKey]}
          resourceLabel="rows"
          emptyTitle="No rows"
          load={load}
          itemKey={(row) => row.id}
          renderItem={(row) => <p>{row.reason}</p>}
        />
      </QueryClientProvider>
    )
  }

  it.each<{ cycle: string; pages: ServicePages; rows: number }>([
    { cycle: 'a, b, a', pages: { first: ['Row 1', 'a'], a: ['Row 2', 'b'], b: ['Row 3', 'a'] }, rows: 3 },
    { cycle: 'a, a', pages: { first: ['Row 1', 'a'], a: ['Row 2', 'a'] }, rows: 2 },
  ])('stops at a repeated cursor ($cycle) with an error and keeps loaded rows', async ({ pages, rows }) => {
    stubAlwaysVisibleSentinel()
    const client = createTestQueryClient()
    const load = pagedService(pages)
    render(renderTab(client, 'cycle', load))

    expect(await screen.findByText("Couldn't load more.", { exact: false })).toBeVisible()
    for (let row = 1; row <= rows; row++) expect(screen.getByText(`Row ${row}`)).toBeVisible()
    expect(load).toHaveBeenCalledTimes(rows)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled())
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more")
    expect(load).toHaveBeenCalledTimes(rows)
    for (let row = 1; row <= rows; row++) expect(screen.getByText(`Row ${row}`)).toBeVisible()
  })

  it.each(['refetch', 'reset'] as const)(
    'rebuilds cursor history on %s after the server changes its page chain',
    async (operation) => {
      stubAlwaysVisibleSentinel()
      const client = createTestQueryClient()
      let pages: ServicePages = {
        first: ['Old row 1', 'a'],
        a: ['Old row 2', 'b'],
        b: ['Old row 3', 'a'],
      }
      const load = vi.fn(async (cursor: string | undefined): Promise<Page<Row>> => {
        const [row, nextCursor] = pages[cursor ?? 'first']!
        return { items: [{ kind: 'unavailable', id: row, reason: row }], cursor: nextCursor }
      })
      render(renderTab(client, 'recovering-stream', load))
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load more")
      expect(screen.getByText('Old row 3')).toBeVisible()

      pages = { first: ['New row 1', 'b'], b: ['New row 2', 'a'], a: ['New row 3'] }
      await act(async () => {
        if (operation === 'refetch') await client.refetchQueries({ queryKey: ['recovering-stream'] })
        else await client.resetQueries({ queryKey: ['recovering-stream'] })
      })

      expect(await screen.findByText('New row 3')).toBeVisible()
      expect(screen.getByText('New row 1')).toBeVisible()
      expect(screen.getByText('New row 2')).toBeVisible()
      expect(screen.queryByText('Old row 3')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('lets separate streams reuse the same cursor tokens and finish normally', async () => {
    stubAlwaysVisibleSentinel()
    const client = createTestQueryClient()
    const pages = { first: ['Row 1', 'a'], a: ['Row 2', 'b'], b: ['Row 3'] } as const
    const firstLoad = pagedService(pages)
    const secondLoad = pagedService(pages)
    render(
      <>
        {renderTab(client, 'first-stream', firstLoad)}
        {renderTab(client, 'second-stream', secondLoad)}
      </>,
    )

    await waitFor(() => expect(screen.getAllByText('Row 3')).toHaveLength(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(firstLoad.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'a', 'b'])
    expect(secondLoad.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'a', 'b'])
  })
})
