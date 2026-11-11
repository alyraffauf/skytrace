import { Skeleton } from '@astryxdesign/core/Skeleton'
import { useRouteMetadata } from '../routes/metadata'
import { isProfileTabEnabled, PROFILE_TABS } from '../routes/profileTabs'
import type { ProfileOutletContext } from './profileContext'
import { AccountDetails } from '../components/profile/AccountDetails'
import { ProfileTabsNav } from '../components/profile/ProfileTabsNav'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { LinkifiedText } from '../components/ui/LinkifiedText'
import { RecordLinksMenu } from '../components/records/RecordLinksMenu'
import { ActorAvatar, actorHandle, actorLabel } from '../components/actors/ActorIdentity'
import { ErrorState } from '../components/ui/States'
import { publicDataServiceFor, type PublicDataService } from '../data/publicData'
import { socialProfilePath } from '../lib/links'
import type { ActorProfile } from '../types'
import type { ProfileHiddenReason } from '../data/actors/profileVisibility'
import { useRouteActor } from '../hooks/useRouteActor'

export function ProfileLayout() {
  const actor = useRouteActor()
  const service = publicDataServiceFor(useQueryClient())
  const { profileTab = PROFILE_TABS[0] } = useRouteMetadata()
  const visibilityQuery = useQuery(service.profileVisibility.queryOptions(actor))
  const visibleIdentity =
    visibilityQuery.isSuccess && visibilityQuery.data.visible ? visibilityQuery.data.profile.identity : undefined
  // Count scans are only needed for visible tabs; profile privacy checks remain independent.
  const blockedCountQuery = useQuery(
    service.blocks.blockedCountQueryOptions(isProfileTabEnabled('blocking') ? visibleIdentity : undefined),
  )
  const blockedByCountQuery = useQuery(
    service.blocks.blockedByCountQueryOptions(isProfileTabEnabled('blocked-by') ? visibleIdentity?.did : undefined),
  )

  let content
  let title = 'Profile — SkyTrace'
  if (visibilityQuery.isPending) content = <ProfileSkeleton />
  else if (visibilityQuery.isError) {
    title = 'Profile unavailable — SkyTrace'
    content = <ErrorState error={visibilityQuery.error} retry={() => void visibilityQuery.refetch()} />
  } else if (!visibilityQuery.data.visible) {
    title = 'Profile unavailable — SkyTrace'
    content = <BlockedProfileState reason={visibilityQuery.data.reason} />
  } else {
    const profile = visibilityQuery.data.profile
    title = `${actorHandle(profile.identity)} — ${profileTab.label} — SkyTrace`
    content = (
      <article className="min-h-[calc(100vh-3rem)] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="border-b border-ui-border bg-ui-canvas lg:sticky lg:top-12 lg:h-[calc(100vh-5.75rem)] lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r">
          <ProfileIdentity profile={profile} service={service} />
        </aside>
        <div className="min-w-0">
          <ProfileTabsNav
            actor={actor}
            blockedCount={blockedCountQuery.data}
            blockedByCount={blockedByCountQuery.data}
          />
          <section className="px-4 sm:px-6 lg:px-8">
            <Suspense
              fallback={
                <div className="py-6">
                  <Skeleton width="100%" height="4rem" />
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
  return (
    <>
      <title>{title}</title>
      {content}
    </>
  )
}

function BlockedProfileState({ reason }: { reason: ProfileHiddenReason }) {
  return (
    <div className="grid min-h-[calc(100vh-3rem)] place-items-center px-6 py-12 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-ui-text">Profile unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-ui-muted">
          {reason === 'opt-out'
            ? 'This account blocks SkyTrace on Bluesky, so its profile and public records are not shown here.'
            : 'This profile has been blocked from SkyTrace.'}
        </p>
        <Link to="/faq#opt-out" className="mt-4 inline-block text-sm text-ui-accent underline underline-offset-2">
          Read about profile visibility and opt-outs
        </Link>
      </div>
    </div>
  )
}

function ProfileIdentity({ profile, service }: { profile: ActorProfile; service: PublicDataService }) {
  const { identity } = profile
  const visibleHandle = actorHandle(identity)
  const hasValidHandle = identity.handle !== 'handle.invalid'
  const profileRecordUri = `at://${identity.did}/app.bsky.actor.profile/self`

  return (
    <div className="p-6 sm:px-8 lg:py-8">
      <header className="flex items-center gap-4">
        <ActorAvatar actor={profile} size="profile" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-tight tracking-[-0.02em] text-ui-text">
            {profile.displayName || visibleHandle}
          </h1>
          <p
            className={`mt-1 text-ui-muted wrap-anywhere ${hasValidHandle ? 'text-sm' : 'font-mono text-xs leading-5'}`}
          >
            {visibleHandle}
          </p>
          {profile.pronouns && <p className="mt-0.5 text-sm text-ui-muted wrap-anywhere">{profile.pronouns}</p>}
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
          className="mt-4 max-w-sm whitespace-pre-wrap text-sm leading-5 text-ui-text wrap-anywhere"
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
      <div className="border-b border-ui-border bg-ui-canvas p-6 sm:px-8 lg:border-b-0 lg:border-r lg:py-8">
        <div className="flex items-center gap-4">
          <Skeleton width="5rem" height="5rem" radius="rounded" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton width="100%" height="1.5rem" className="max-w-48" />
            <Skeleton width="7rem" height="1rem" className="mt-2" />
          </div>
          <Skeleton width="2rem" height="2rem" className="shrink-0" />
        </div>
        <Skeleton width="100%" height="6rem" className="mt-5" />
        <Skeleton width="100%" height="3rem" className="mt-5" />
      </div>
      <div className="px-5 py-8 sm:px-8">
        <Skeleton width="100%" height="2.5rem" className="max-w-lg" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} width="100%" height="4rem" />
          ))}
        </div>
      </div>
    </div>
  )
}
