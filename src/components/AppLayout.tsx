import { HeartIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { ActorSearch } from './ActorSearch'

export function AppLayout() {
  const location = useLocation()
  const isExplorerRoute = location.pathname.startsWith('/profile/') || location.pathname.startsWith('/list/')

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 border border-zinc-950 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 focus:translate-y-0 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5 text-zinc-950 dark:text-zinc-100">
            <MagnifyingGlassIcon className="size-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span className="text-base font-semibold">SkyTrace</span>
          </Link>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
            {isExplorerRoute && (
              <div className="hidden w-full max-w-md md:block">
                <ActorSearch compact />
              </div>
            )}
            <a
              href="https://ko-fi.com/alyraffauf"
              target="_blank"
              rel="noreferrer"
              aria-label="Support SkyTrace on Ko-fi"
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm border border-rose-600 bg-rose-600 px-2.5 text-sm font-medium text-white hover:border-rose-700 hover:bg-rose-700 dark:border-rose-400 dark:bg-rose-400 dark:text-zinc-950 dark:hover:border-rose-300 dark:hover:bg-rose-300"
            >
              <HeartIcon className="size-4" aria-hidden="true" />
              Donate
            </a>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={
          isExplorerRoute
            ? 'mx-auto w-full max-w-[1440px] flex-1'
            : 'mx-auto grid w-full max-w-3xl flex-1 place-items-center px-5 py-12 sm:px-8'
        }
      >
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        <div className="mx-auto grid min-h-11 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a
            href="https://ko-fi.com/alyraffauf"
            target="_blank"
            rel="noreferrer"
            className="justify-self-start rounded-sm text-zinc-600 hover:text-rose-700 hover:underline dark:text-zinc-400 dark:hover:text-rose-300"
          >
            Donate
          </a>
          <span className="text-center">
            Made by{' '}
            <a
              href="https://aly.codes"
              target="_blank"
              rel="noreferrer"
              className="rounded-sm font-medium text-zinc-700 hover:text-rose-700 hover:underline dark:text-zinc-300 dark:hover:text-rose-300"
            >
              Aly Raffauf
            </a>
          </span>
          <a
            href="https://tangled.org/aly.codes/skytrace"
            target="_blank"
            rel="noreferrer"
            className="justify-self-end rounded-sm text-right text-zinc-600 hover:text-rose-700 hover:underline dark:text-zinc-400 dark:hover:text-rose-300"
          >
            Tangled
          </a>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  )
}
