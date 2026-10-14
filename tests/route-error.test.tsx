import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { RouteError } from '../src/routes/RouteError'
import { registerPreloadRecovery } from '../src/routes/preloadRecovery'

beforeEach(() => window.sessionStorage.clear())

function renderRouteError(error: unknown, path = '/profile/did:plc:example/labels?source=test#history') {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        loader: () => {
          throw error
        },
        element: <div>Page content</div>,
        errorElement: <RouteError />,
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

it('describes a failed module download and offers a full refresh at the same URL', async () => {
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/ProfileLayout-old.js')
  const unregister = registerPreloadRecovery(vi.fn())
  window.dispatchEvent(Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: error }))
  unregister()

  renderRouteError(error)

  expect(await screen.findByRole('heading', { name: 'This page needs a refresh' })).toBeVisible()
  expect(screen.getByText('Part of this page could not be downloaded. Refresh the page to try again.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Refresh page' })).toBeVisible()
  expect(document.title).toBe('Page unavailable — SkyTrace')
  expect(screen.queryByText(error.message)).not.toBeInTheDocument()
})

it('keeps the missing-route message for HTTP 404 errors', async () => {
  renderRouteError(new Response('Not found', { status: 404, statusText: 'Not Found' }))

  expect(await screen.findByRole('heading', { name: 'That route went missing' })).toBeVisible()
  expect(document.title).toBe('Page not found — SkyTrace')
  expect(screen.queryByRole('button', { name: 'Refresh page' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to search' })).toHaveAttribute('href', '/')
})

it.each([
  new Error('Rendering failed'),
  new Response('Service unavailable', { status: 503, statusText: 'Service Unavailable' }),
])('does not describe other failures as missing routes: %s', async (error) => {
  renderRouteError(error)

  expect(await screen.findByRole('heading', { name: 'This page could not be opened' })).toBeVisible()
  expect(document.title).toBe('Page unavailable — SkyTrace')
  expect(screen.getByRole('button', { name: 'Refresh page' })).toBeVisible()
  expect(screen.queryByText('That route went missing')).not.toBeInTheDocument()
})
