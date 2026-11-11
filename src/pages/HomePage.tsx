import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { DonateButton } from '../components/ui/DonateButton'
import { RainCloud } from '../components/ui/RainCloud'
import { ActorSearch } from '../components/actors/ActorSearch'

export function HomePage() {
  return (
    <div className="home-hero flex w-full flex-1 items-center justify-center text-center">
      <title>SkyTrace — Explore Bluesky blocks, labels, lists, and posts</title>
      <div className="mx-auto w-full max-w-2xl pb-4">
        <RainCloud className="rain-cloud pointer-events-none mx-auto mb-5 size-40 overflow-visible stroke-[1.2] text-ui-mark sm:size-56" />
        <h1 className="mx-auto text-4xl font-semibold tracking-[-0.035em] text-ui-text sm:text-6xl">SkyTrace</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ui-muted sm:text-lg">
          Find a Bluesky account and view its blocks, labels, lists, and posts.
        </p>
        <div className="mx-auto mt-8 max-w-xl text-left">
          <ActorSearch autoFocus />
        </div>
        <div className="mt-5 flex justify-center">
          <DonateButton className="h-11 px-5" />
        </div>
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-ui-muted">
          <ShieldCheckIcon className="size-4 text-ui-accent" aria-hidden="true" />
          No sign-in, ads, or tracking.
        </p>
      </div>
    </div>
  )
}
