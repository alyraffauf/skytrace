import { HeartIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { CloudRain } from 'lucide-react'
import { ActorSearch } from '../components/ActorSearch'

export function HomePage() {
  return (
    <div className="home-hero relative isolate flex w-full flex-1 items-center justify-center overflow-hidden text-center">
      <div className="pointer-events-none absolute inset-x-0 top-[10%] h-64 sm:top-[12%]" aria-hidden="true">
        <CloudRain className="rain-cloud absolute left-1/2 top-0 size-40 -translate-x-1/2 stroke-[1.2] text-violet-500 dark:text-violet-400 sm:size-56" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl pb-4 pt-28 sm:pt-32">
        <h1 className="mx-auto text-4xl font-semibold tracking-[-0.035em] text-zinc-950 dark:text-zinc-100 sm:text-6xl">
          SkyTrace
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
          Find a Bluesky account and view its blocks, labels, lists, and posts.
        </p>
        <div className="mx-auto mt-8 max-w-xl text-left">
          <ActorSearch autoFocus />
        </div>
        <a
          href="https://ko-fi.com/alyraffauf"
          target="_blank"
          rel="noreferrer"
          className="mx-auto mt-5 flex min-h-11 w-fit items-center gap-2 rounded-md border border-violet-600 bg-violet-600 px-5 text-sm font-semibold text-white hover:border-violet-700 hover:bg-violet-700 dark:border-violet-400 dark:bg-violet-400 dark:text-zinc-950 dark:hover:border-violet-300 dark:hover:bg-violet-300"
        >
          <HeartIcon className="size-4" aria-hidden="true" />
          Donate
        </a>
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <ShieldCheckIcon className="size-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          No sign-in, ads, or tracking.
        </p>
      </div>
    </div>
  )
}
