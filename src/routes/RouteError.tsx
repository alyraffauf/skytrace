import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { isPreloadError } from './preloadRecovery'

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
    <main className="grid min-h-screen place-items-center bg-white px-4 dark:bg-zinc-950 dark:text-zinc-100">
      <title>{isNotFound ? 'Page not found — SkyTrace' : 'Page unavailable — SkyTrace'}</title>
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {!isNotFound && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-block border border-zinc-300 px-4 py-2 font-medium text-violet-700 hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:text-violet-300 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
            >
              Refresh page
            </button>
          )}
          <Link
            to="/"
            className="inline-block border border-zinc-300 px-4 py-2 font-medium text-violet-700 hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:text-violet-300 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
          >
            Back to search
          </Link>
        </div>
      </div>
    </main>
  )
}
