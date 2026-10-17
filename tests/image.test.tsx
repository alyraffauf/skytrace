import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImageWithFallback } from '../src/components/ui/ImageWithFallback'

describe('image fallbacks', () => {
  it('shows an image that finished loading before React received its load event', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(100)

    render(<ImageWithFallback src="https://example.com/cached.jpg" alt="Cached avatar" fallback="avatar" />)

    expect(screen.getByRole('img', { name: 'Cached avatar' })).toHaveAttribute('data-loaded', 'true')
  })

  it('resets failure state when the image source changes', async () => {
    const view = render(<ImageWithFallback src="https://example.com/old.jpg" alt="Preview" fallback="image" />)
    fireEvent.error(screen.getByRole('img', { name: 'Preview' }))
    expect(screen.getByRole('img', { name: 'Preview' }).tagName).toBe('SPAN')
    view.rerender(<ImageWithFallback src="https://example.com/new.jpg" alt="Preview" fallback="image" />)
    expect(await screen.findByRole('img', { name: 'Preview' })).toHaveAttribute('src', 'https://example.com/new.jpg')
  })
})

it('forwards image events and clears loaded status for a replacement source', () => {
  const onLoad = vi.fn()
  const onError = vi.fn()
  const view = render(
    <ImageWithFallback
      src="https://example.com/first.jpg"
      alt="Preview"
      fallback="image"
      onLoad={onLoad}
      onError={onError}
    />,
  )
  const firstImage = screen.getByRole('img', { name: 'Preview' })
  fireEvent.load(firstImage)
  expect(firstImage).toHaveAttribute('data-loaded', 'true')
  expect(onLoad).toHaveBeenCalledOnce()

  view.rerender(
    <ImageWithFallback
      src="https://example.com/next.jpg"
      alt="Preview"
      fallback="image"
      onLoad={onLoad}
      onError={onError}
    />,
  )
  const nextImage = screen.getByRole('img', { name: 'Preview' })
  expect(nextImage).not.toHaveAttribute('data-loaded')
  fireEvent.error(nextImage)
  expect(onError).toHaveBeenCalledOnce()
  expect(screen.getByRole('img', { name: 'Preview' }).tagName).toBe('SPAN')
})
