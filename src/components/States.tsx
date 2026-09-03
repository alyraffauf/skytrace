import { ArrowPathIcon, ExclamationTriangleIcon, InboxIcon } from '@heroicons/react/24/outline'
import { ClientResponseError } from '@atcute/client'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-label="Loading"
      aria-live="polite"
      className="divide-y divide-zinc-200 border-b border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
    >
      <span className="sr-only" role="status">
        Loading public records…
      </span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-2.5 py-2">
          <div className="skeleton size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-36" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="border-b border-zinc-200 px-6 py-8 text-center dark:border-zinc-800">
      <InboxIcon className="mx-auto size-6 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
      <h2 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {children && (
        <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-zinc-600 dark:text-zinc-400">{children}</p>
      )}
    </section>
  )
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const message = readableError(error)
  return (
    <section
      role="alert"
      className="border-b border-red-200 bg-red-50/60 px-5 py-6 text-center dark:border-red-900 dark:bg-red-950/30"
    >
      <ExclamationTriangleIcon className="mx-auto size-8 text-red-500 dark:text-red-400" aria-hidden="true" />
      <h2 className="mt-2 font-semibold text-red-950 dark:text-red-200">Couldn&apos;t load</h2>
      <p className="mt-1 text-sm text-red-800 dark:text-red-300">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex items-center gap-2 border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/60"
        >
          <ArrowPathIcon className="size-4" aria-hidden="true" /> Retry
        </button>
      )}
    </section>
  )
}

function readableError(error: Error): string {
  if (!(error instanceof ClientResponseError)) return error.message
  if (error.status === 404) return "We couldn't find that account or public record."
  if (error.status === 429) return 'The public service is busy. Wait a moment, then retry.'
  if (error.status >= 500) return 'A public data service is temporarily unavailable.'
  return error.description || 'The public service rejected this request.'
}

export function UnavailableCard({ reason, bordered = false }: { reason: string; bordered?: boolean }) {
  return (
    <div
      className={`flex min-h-12 items-center gap-2.5 py-2 text-sm text-zinc-500 dark:text-zinc-400 ${bordered ? 'border-b border-zinc-200 dark:border-zinc-800' : ''}`}
    >
      <ExclamationTriangleIcon className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
      <span>{reason}</span>
    </div>
  )
}

export function RouteError() {
  const routeError = useRouteError()
  const message = isRouteErrorResponse(routeError)
    ? routeError.statusText
    : routeError instanceof Error
      ? routeError.message
      : 'This page could not be opened.'
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 dark:bg-zinc-950 dark:text-zinc-100">
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
