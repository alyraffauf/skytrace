import { HeartIcon } from '@heroicons/react/24/outline'
import { DonateReminder } from '../components/ui/DonateReminder'
import { RainCloud } from '../components/ui/RainCloud'
import { Link, Outlet, ScrollRestoration } from 'react-router-dom'
import { useRouteMetadata } from '../routes/metadata'
import { ActorSearch } from '../components/actors/ActorSearch'

export function AppLayout() {
  const { presentation } = useRouteMetadata()
  const isHomeRoute = presentation === 'home'
  const isExplorerRoute = presentation === 'explorer'

  return (
    <div className="flex min-h-screen min-h-dvh flex-col bg-white pb-[calc(2.75rem+env(safe-area-inset-bottom))] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 border border-zinc-950 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 focus:translate-y-0 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100"
      >
        Skip to content
      </a>
      {!isHomeRoute && (
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <RainCloud className="rain-cloud size-5 shrink-0 stroke-[1.8] text-violet-600 dark:text-violet-400" />
              <span className="text-base font-semibold">SkyTrace</span>
            </Link>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              {isExplorerRoute && (
                <div className="hidden w-full max-w-md md:block">
                  <ActorSearch compact />
                </div>
              )}
              <a
                href="https://ko-fi.com/alyraffauf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm border border-violet-600 bg-violet-600 px-2.5 text-sm font-medium text-white hover:border-violet-700 hover:bg-violet-700 dark:border-violet-400 dark:bg-violet-400 dark:text-zinc-950 dark:hover:border-violet-300 dark:hover:bg-violet-300"
              >
                <HeartIcon className="size-4" aria-hidden="true" />
                Donate
              </a>
            </div>
          </div>
        </header>
      )}
      <main
        id="main-content"
        tabIndex={-1}
        className={`mx-auto w-full max-w-[1440px] flex-1 ${isExplorerRoute ? '' : 'flex px-5 sm:px-8'}`}
      >
        <Outlet />
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto grid min-h-11 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <nav aria-label="About SkyTrace" className="flex items-center gap-3 justify-self-start">
            <Link
              to="/faq"
              className="rounded-sm text-zinc-600 hover:text-violet-700 hover:underline dark:text-zinc-400 dark:hover:text-violet-300"
            >
              FAQ
            </Link>
            <a
              href="https://bsky.app/profile/skytrace.aly.town"
              target="_blank"
              rel="noreferrer"
              className="rounded-sm text-zinc-600 hover:text-violet-700 hover:underline dark:text-zinc-400 dark:hover:text-violet-300"
            >
              Bluesky
            </a>
          </nav>
          <span className="text-center">
            Made by{' '}
            <a
              href="https://aly.codes"
              target="_blank"
              rel="noreferrer"
              className="rounded-sm font-medium text-zinc-700 hover:text-violet-700 hover:underline dark:text-zinc-300 dark:hover:text-violet-300"
            >
              Aly Raffauf
            </a>
          </span>
          <a
            href="https://tangled.org/aly.codes/skytrace"
            target="_blank"
            rel="noreferrer"
            className="justify-self-end rounded-sm text-right text-zinc-600 hover:text-violet-700 hover:underline dark:text-zinc-400 dark:hover:text-violet-300"
          >
            Tangled
          </a>
        </div>
      </footer>
      <ScrollRestoration />
      <DonateReminder />
    </div>
  )
}
