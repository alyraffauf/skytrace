import { ChevronRightIcon, ServerStackIcon } from '@heroicons/react/24/outline'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType, useParams } from 'react-router-dom'
import { ImageWithFallback } from '../components/Images'
import { LinkifiedText } from '../components/LinkifiedText'
import { RecordLinksMenu } from '../components/RecordLinksMenu'
import { actorHandle, actorLabel } from '../components/ActorIdentity'
import { ErrorState } from '../components/States'
import { cdnImageUrl } from '../lib/cdn'
import { formatDate } from '../lib/dates'
import { publicDataServiceFor, type PublicDataService } from '../data/publicData'
import { socialProfilePath } from '../lib/links'
import { profilePath, profileTabPath } from '../lib/routes'
import type { ActorProfile } from '../types'
import { PROFILE_TABS } from '../profileTabRoutes'

export type ProfileOutletContext = {
  profile: ActorProfile
  service: PublicDataService
}

export function ProfilePage() {
  const { actor = '' } = useParams()
  const service = publicDataServiceFor(useQueryClient())
  const location = useLocation()
  const navigationType = useNavigationType()
  const tabListRef = useRef<HTMLDivElement>(null)
  const profileQuery = useQuery({
    ...service.actorProfileQueryOptions(actor),
  })

  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0 })
  }, [location.pathname, location.search, navigationType])

  useEffect(() => {
    const tabList = tabListRef.current
    const activeTab = tabList?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!tabList || !activeTab) return
    const left = activeTab.offsetLeft
    const right = left + activeTab.offsetWidth
    if (left < tabList.scrollLeft || right > tabList.scrollLeft + tabList.clientWidth) {
      tabList.scrollTo({
        behavior: 'smooth',
        left: left - (tabList.clientWidth - activeTab.offsetWidth) / 2,
      })
    }
  }, [location.pathname, profileQuery.isSuccess])

  if (profileQuery.isPending) return <ProfileSkeleton />
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} retry={() => void profileQuery.refetch()} />
  const profile = profileQuery.data
  const { identity } = profile
  const visibleHandle = actorHandle(identity)

  return (
    <article className="min-h-[calc(100vh-3rem)] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="border-b border-zinc-200 dark:border-zinc-800 lg:sticky lg:top-12 lg:h-[calc(100vh-5.75rem)] lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r">
        <ProfileIdentity profile={profile} visibleHandle={visibleHandle} service={service} />
      </aside>
      <div className="min-w-0">
        <nav
          aria-label="Profile sections"
          className="sticky top-12 z-30 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div ref={tabListRef} className="tabs-scroll scrollbar-none flex gap-6 overflow-x-auto px-4 sm:px-6 lg:px-7">
            {PROFILE_TABS.map(({ id, path, label }) => (
              <NavLink
                key={id}
                to={path ? profileTabPath(actor, path) : profilePath(actor)}
                end={!path}
                className={({ isActive }) =>
                  `flex min-h-12 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-0.5 text-sm font-medium sm:min-h-0 sm:py-3 ${isActive ? 'border-rose-600 text-rose-700 dark:border-rose-400 dark:text-rose-300' : 'border-transparent text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
        <section className="max-w-3xl px-4 sm:px-6 lg:px-7">
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

function ProfileIdentity({
  profile,
  visibleHandle,
  service,
}: {
  profile: ActorProfile
  visibleHandle: string
  service: PublicDataService
}) {
  const { identity } = profile
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsQuery = useQuery({ ...service.accountDetailsQueryOptions(identity.did), enabled: detailsOpen })
  const hasValidHandle = identity.handle !== 'handle.invalid'
  const profileRecordUri = `at://${identity.did}/app.bsky.actor.profile/self`
  const avatarClassName = 'size-16 shrink-0 rounded-full'
  const avatar = (
    <ImageWithFallback
      src={profile.avatarCid ? cdnImageUrl('avatar', identity.did, profile.avatarCid) : undefined}
      alt={`${actorLabel(profile)}'s avatar`}
      fallback="avatar"
      fallbackClassName={avatarClassName}
      className={`${avatarClassName} bg-zinc-100 object-cover dark:bg-zinc-900`}
      loading="eager"
    />
  )

  return (
    <div className="px-4 py-4 sm:px-6 lg:py-6">
      <header className="flex items-start gap-3.5">
        {avatar}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-semibold leading-tight text-zinc-950 dark:text-zinc-100">
                {profile.displayName || visibleHandle}
              </h1>
              <p
                className={`mt-1 text-zinc-500 [overflow-wrap:anywhere] dark:text-zinc-400 ${hasValidHandle ? 'text-sm' : 'font-mono text-[11px] leading-4'}`}
              >
                {visibleHandle}
              </p>
            </div>
            <RecordLinksMenu
              recordUri={profileRecordUri}
              socialPath={socialProfilePath(identity.did)}
              label={actorLabel(profile)}
            />
          </div>
        </div>
      </header>

      {profile.description && (
        <LinkifiedText
          text={profile.description}
          className="mt-4 hidden whitespace-pre-wrap text-sm leading-5 text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400 lg:block"
        />
      )}

      <details
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        className="group mt-5 border-t border-zinc-200 pt-3.5 dark:border-zinc-800"
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
          <ChevronRightIcon className="size-3.5 group-open:rotate-90" aria-hidden="true" />
          Account details
        </summary>
        <div className="lg:hidden">
          {profile.description && (
            <LinkifiedText
              text={profile.description}
              className="mb-4 whitespace-pre-wrap text-sm leading-5 text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400"
            />
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          {detailsQuery.data?.createdAt && (
            <Detail label="Created" value={formatDate(detailsQuery.data.createdAt) ?? detailsQuery.data.createdAt} />
          )}
          {detailsQuery.data?.aliases.length ? (
            <DetailList label="Aliases" values={detailsQuery.data.aliases.map(formatAlias)} />
          ) : null}
          {detailsQuery.data?.formerHandles.length ? (
            <DetailList
              label="Former usernames"
              values={detailsQuery.data.formerHandles.map((handle) => `@${handle}`)}
            />
          ) : null}
          <div className="min-w-0">
            <dt className="font-medium text-zinc-700 dark:text-zinc-300">DID</dt>
            <dd className="mt-1 break-all font-mono text-[11px]">{identity.did}</dd>
          </div>
          <div className="min-w-0">
            <dt className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
              <ServerStackIcon className="size-3.5" aria-hidden="true" /> PDS host
            </dt>
            <dd className="mt-1 break-all font-mono text-[11px]">{new URL(identity.pds).host}</dd>
          </div>
          {detailsOpen && detailsQuery.isPending && (
            <div className="text-zinc-500 dark:text-zinc-400">Loading identity history...</div>
          )}
          {detailsQuery.isError && (
            <div className="text-zinc-500 dark:text-zinc-400">Identity history unavailable.</div>
          )}
        </dl>
      </details>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-zinc-700 dark:text-zinc-300">{label}</dt>
      <dd className="mt-1 break-all font-mono text-[11px]">{value}</dd>
    </div>
  )
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-zinc-700 dark:text-zinc-300">{label}</dt>
      <dd className="mt-1">
        <ul className="grid gap-1 font-mono text-[11px]">
          {values.map((value) => (
            <li key={value} className="break-all">
              {value}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  )
}

function formatAlias(alias: string): string {
  return alias.startsWith('at://') ? `@${alias.slice(5)}` : alias
}

function ProfileSkeleton() {
  return (
    <div aria-label="Loading profile" className="min-h-[calc(100vh-3rem)] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="border-b border-zinc-200 px-6 py-6 dark:border-zinc-800 lg:border-b-0 lg:border-r">
        <div className="flex items-start gap-3.5">
          <div className="skeleton size-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 pt-1">
            <div className="skeleton h-6 w-28" />
            <div className="skeleton mt-2 h-4 w-24" />
          </div>
        </div>
        <div className="skeleton mt-5 h-24 w-full" />
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
