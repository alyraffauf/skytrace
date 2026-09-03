import { ActorSearch } from '../components/ActorSearch'

export function HomePage() {
  return (
    <div className="mx-auto w-full max-w-2xl text-center">
      <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-100 sm:text-5xl">
        Find an account.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
        See their labels, blocks, lists, posts, and username history.
      </p>
      <div className="mx-auto mt-8 max-w-xl text-left">
        <ActorSearch autoFocus />
      </div>
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
        Read-only, with a shareable URL for every view. No sign-in.
      </p>
    </div>
  )
}
