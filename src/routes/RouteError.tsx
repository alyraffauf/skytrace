import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

export function RouteError() {
  const routeError = useRouteError()
  const message = isRouteErrorResponse(routeError)
    ? routeError.statusText
    : routeError instanceof Error
      ? routeError.message
      : 'This page could not be opened.'
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 dark:bg-zinc-950 dark:text-zinc-100">
      <title>Page not found — SkyTrace</title>
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">That route went missing</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{message}</p>
        <Link
          to="/"
          className="mt-5 inline-block border border-zinc-300 px-4 py-2 font-medium text-violet-700 hover:border-violet-300 hover:bg-violet-50 dark:border-zinc-700 dark:text-violet-300 dark:hover:border-violet-700 dark:hover:bg-violet-950/40"
        >
          Back to search
        </Link>
      </div>
    </main>
  )
}
