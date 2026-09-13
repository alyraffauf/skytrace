import { AccountDetails } from '../components/AccountDetails'
import { ProfileTabsNav } from '../components/ProfileTabsNav'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Suspense, useLayoutEffect } from 'react'
import { Outlet, useLocation, useNavigationType, useParams } from 'react-router-dom'
import { LinkifiedText } from '../components/LinkifiedText'
import { RecordLinksMenu } from '../components/RecordLinksMenu'
import { ActorAvatar, actorHandle, actorLabel } from '../components/ActorIdentity'
import { ErrorState } from '../components/States'
import { publicDataServiceFor, type PublicDataService } from '../data/publicData'
import { socialProfilePath } from '../lib/links'
import type { ActorProfile } from '../types'
import { blockTargetDid } from '../config/privacy'

export type ProfileOutletContext = {
  profile: ActorProfile
  service: PublicDataService
}

export function ProfilePage() {
  const { actor = '' } = useParams()
  const service = publicDataServiceFor(useQueryClient())
  const location = useLocation()
  const navigationType = useNavigationType()
  const configuredBlockTargetDid = blockTargetDid()
  const profileQuery = useQuery({
    ...service.core.actorProfileQueryOptions(actor),
  })
  const actorBlocksConfiguredAccountQuery = useQuery(
    service.graph.actorBlocksConfiguredAccountQueryOptions(profileQuery.data?.identity.did, configuredBlockTargetDid),
  )
  const blockCheckFinished = configuredBlockTargetDid === undefined || actorBlocksConfiguredAccountQuery.data === false
  const visibleIdentity = blockCheckFinished ? profileQuery.data?.identity : undefined
  const blockedCountQuery = useQuery(service.core.blockedCountQueryOptions(visibleIdentity))
  const blockedByCountQuery = useQuery(service.core.blockedByCountQueryOptions(visibleIdentity?.did))

  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0 })
  }, [location.pathname, location.search, navigationType])

  if (profileQuery.isPending) return <ProfileSkeleton />
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} retry={() => void profileQuery.refetch()} />
  if (configuredBlockTargetDid && actorBlocksConfiguredAccountQuery.isPending) return <ProfileSkeleton />
  if (configuredBlockTargetDid && actorBlocksConfiguredAccountQuery.isError)
    return (
      <ErrorState
        error={actorBlocksConfiguredAccountQuery.error}
        retry={() => void actorBlocksConfiguredAccountQuery.refetch()}
      />
    )
  if (configuredBlockTargetDid && actorBlocksConfiguredAccountQuery.data) return <BlockedProfileState />
  const profile = profileQuery.data

  return (
    <article className="min-h-[calc(100vh-3rem)] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="border-b border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950 lg:sticky lg:top-12 lg:h-[calc(100vh-5.75rem)] lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r">
        <ProfileIdentity profile={profile} service={service} />
      </aside>
      <div className="min-w-0">
        <ProfileTabsNav actor={actor} blockedCount={blockedCountQuery.data} blockedByCount={blockedByCountQuery.data} />
        <section className="px-4 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <div className="py-6">
                <div className="skeleton h-16 w-full" />
              </div>
            }
          >
            <Outlet context={{ profile, service } satisfies ProfileOutletContext} />
          </Suspense>
        </section>
      </div>
    </article>
  )
}

function BlockedProfileState() {
  return (
    <main className="grid min-h-[calc(100vh-3rem)] place-items-center px-6 py-12 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-100">Profile unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          This account blocks this SkyTrace instance on Bluesky, so its profile and public records are not shown here.
        </p>
      </div>
    </main>
  )
}

function ProfileIdentity({ profile, service }: { profile: ActorProfile; service: PublicDataService }) {
  const { identity } = profile
  const visibleHandle = actorHandle(identity)
  const hasValidHandle = identity.handle !== 'handle.invalid'
  const profileRecordUri = `at://${identity.did}/app.bsky.actor.profile/self`

  return (
    <div className="px-6 py-6 sm:px-8 lg:px-8 lg:py-8">
      <header className="relative flex items-center gap-4">
        <ActorAvatar profile={profile} size="profile" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-tight tracking-[-0.02em] text-zinc-950 dark:text-zinc-100">
            {profile.displayName || visibleHandle}
          </h1>
          <p
            className={`mt-1 text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400 ${hasValidHandle ? 'text-sm' : 'font-mono text-xs leading-5'}`}
          >
            {visibleHandle}
          </p>
          {profile.pronouns && (
            <p className="mt-0.5 text-sm text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400">
              {profile.pronouns}
            </p>
          )}
        </div>
        <RecordLinksMenu
          recordUri={profileRecordUri}
          socialPath={socialProfilePath(identity.did)}
          label={actorLabel(profile)}
        />
      </header>

      {profile.description && (
        <LinkifiedText
          text={profile.description}
          className="mt-4 max-w-sm whitespace-pre-wrap text-sm leading-5 text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300"
        />
      )}

      <AccountDetails identity={identity} service={service} />
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div
      aria-label="Loading profile"
      className="min-h-[calc(100vh-3rem)] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <div className="border-b border-zinc-200 bg-zinc-50/50 px-6 py-6 dark:border-zinc-800 dark:bg-zinc-950 sm:px-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-8">
        <div className="flex items-center gap-4">
          <div className="skeleton size-20 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-6 w-full max-w-48" />
            <div className="skeleton mt-2 h-4 w-28" />
          </div>
          <div className="skeleton size-8 shrink-0 rounded" />
        </div>
        <div className="skeleton mt-5 h-24 w-full" />
        <div className="skeleton mt-5 h-12 w-full" />
      </div>
      <div className="px-5 py-8 sm:px-8">
        <div className="skeleton h-10 w-full max-w-lg" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="skeleton h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
