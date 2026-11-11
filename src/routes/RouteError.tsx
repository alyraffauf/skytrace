import { Button } from '@astryxdesign/core/Button'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { isPreloadError } from './preloadErrors'

export function RouteError() {
  const routeError = useRouteError()
  const isNotFound = isRouteErrorResponse(routeError) && routeError.status === 404
  const preloadFailed = isPreloadError(routeError)
  let heading = 'This page could not be opened'
  if (isNotFound) {
    heading = 'That route went missing'
  } else if (preloadFailed) {
    heading = 'This page needs a refresh'
  }
  let message = 'This page could not be opened.'
  if (preloadFailed) {
    message = 'Part of this page could not be downloaded. Refresh the page to try again.'
  } else if (isRouteErrorResponse(routeError)) {
    message = routeError.statusText
  } else if (routeError instanceof Error) {
    message = routeError.message
  }
  return (
    <main className="grid min-h-screen place-items-center bg-ui-canvas px-4">
      <title>{isNotFound ? 'Page not found — SkyTrace' : 'Page unavailable — SkyTrace'}</title>
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="mt-2 text-ui-muted">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {!isNotFound && <Button label="Refresh page" onClick={() => window.location.reload()} />}
          <Button as={Link} href="/" label="Back to search" variant="primary" />
        </div>
      </div>
    </main>
  )
}
