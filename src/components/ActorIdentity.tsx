import { ImageWithFallback } from './Images'
import { cdnImageUrl } from '../lib/cdn'
import { isDid } from '../lib/parse'
import { profilePath } from '../lib/routes'
import type { ActorIdentity, ActorProfile } from '../types'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publicDataServiceFor } from '../data/publicData'
import type { Actor, ActorReference } from '../types'
import type { ReactNode } from 'react'

export function actorLabel(profile: ActorProfile): string {
  if (profile.displayName) return profile.displayName
  return actorHandle(profile.identity)
}

export function actorHandle(identity: ActorIdentity): string {
  return identity.handle === 'handle.invalid' ? identity.did : `@${identity.handle}`
}

export function ActorIdentityText({ profile, inline = false }: { profile: ActorProfile; inline?: boolean }) {
  const handle = actorHandle(profile.identity)
  return (
    <Link
      to={profilePath(profile.identity.did)}
      className={`group/actor min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 ${inline ? 'flex items-baseline gap-2' : ''}`}
    >
      <p className="truncate text-sm font-semibold tracking-[-0.01em] text-zinc-950 dark:text-zinc-100">
        {actorLabel(profile)}
      </p>
      <p className="truncate text-xs text-zinc-500 group-hover/actor:text-rose-700 dark:text-zinc-400 dark:group-hover/actor:text-rose-300 sm:text-sm">
        {handle}
      </p>
    </Link>
  )
}

export function ActorAvatar({
  profile,
  size = 'medium',
  decorative = false,
}: {
  profile: ActorProfile
  size?: 'small' | 'row' | 'medium' | 'large'
  decorative?: boolean
}) {
  const sizeClass = size === 'small' ? 'size-6' : size === 'row' ? 'size-8' : size === 'large' ? 'size-24' : 'size-10'
  return (
    <ImageWithFallback
      src={profile.avatarCid ? cdnImageUrl('avatar', profile.identity.did, profile.avatarCid) : undefined}
      alt={decorative ? '' : `${actorLabel(profile)}'s avatar`}
      fallback="avatar"
      fallbackClassName={`${sizeClass} shrink-0 rounded-full`}
      className={`${sizeClass} shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-900`}
      loading={size === 'large' ? 'eager' : 'lazy'}
    />
  )
}

function useReferencedProfile(actor: ActorReference) {
  const service = publicDataServiceFor(useQueryClient())
  return useQuery(service.actorProfileQueryOptions(actor.did))
}

export function HydratedActor({
  actor,
  children,
}: {
  actor: ActorReference
  children: (actor: ActorProfile | ActorReference) => ReactNode
}) {
  const query = useReferencedProfile(actor)
  return children(query.data ?? actor)
}

export function ActorReferenceAvatar({ actor, size = 'row' }: { actor: ActorReference; size?: 'small' | 'row' }) {
  const sizeClass = size === 'small' ? 'size-6' : 'size-8'
  return (
    <ImageWithFallback
      alt=""
      title={actor.did}
      fallback="avatar"
      fallbackClassName={`${sizeClass} shrink-0 rounded-full`}
      className={`${sizeClass} rounded-full`}
    />
  )
}

export function ActorReferenceText({ actor }: { actor: ActorReference }) {
  return (
    <Link
      to={profilePath(actor.did)}
      className="truncate rounded-sm font-mono text-xs text-zinc-700 hover:text-rose-700 hover:underline dark:text-zinc-300 dark:hover:text-rose-300"
    >
      {actor.did}
    </Link>
  )
}

export function ActorHandle({ actor, compact = false }: { actor: Actor; compact?: boolean }) {
  if (actor.kind === 'unavailable')
    return <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">Account unavailable</span>
  if (actor.kind === 'actorReference') {
    return (
      <Link
        to={profilePath(actor.did)}
        className="truncate rounded-sm font-mono text-xs text-zinc-700 hover:text-rose-700 hover:underline dark:text-zinc-300 dark:hover:text-rose-300"
      >
        {actor.did}
      </Link>
    )
  }
  const handle = actorHandle(actor.identity)
  return (
    <Link
      to={profilePath(actor.identity.did)}
      className={`truncate rounded-sm hover:text-rose-700 hover:underline dark:hover:text-rose-300 ${compact ? 'text-xs font-normal text-zinc-600 dark:text-zinc-400' : 'text-sm font-medium text-zinc-800 dark:text-zinc-200'}`}
    >
      {handle}
    </Link>
  )
}

export function MiniActor({ actor, label }: { actor: Actor; label?: string }) {
  if (actor.kind === 'actorReference') {
    return (
      <HydratedActor actor={actor}>
        {(hydratedActor) => <MiniActorView actor={hydratedActor} label={label} />}
      </HydratedActor>
    )
  }
  return <MiniActorView actor={actor} label={label} />
}

function MiniActorView({ actor, label }: { actor: Actor; label?: string }) {
  if (actor.kind === 'unavailable') {
    const did = isDid(actor.id) ? actor.id : undefined
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {label && <span>{label}</span>}
        {did ? (
          <Link
            to={profilePath(did)}
            className="truncate rounded-sm font-mono text-[11px] text-zinc-600 hover:text-rose-700 hover:underline dark:text-zinc-400 dark:hover:text-rose-300"
            title={did}
          >
            {did}
          </Link>
        ) : (
          <span>Account unavailable</span>
        )}
      </span>
    )
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      {label && <span>{label}</span>}
      {actor.kind === 'actorReference' ? (
        <ActorReferenceAvatar actor={actor} size="small" />
      ) : (
        <ActorAvatar profile={actor} size="small" decorative />
      )}
      <ActorHandle actor={actor} compact />
    </span>
  )
}
