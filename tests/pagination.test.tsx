import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InfiniteScroll } from '../src/components/pagination/InfiniteScroll'

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
