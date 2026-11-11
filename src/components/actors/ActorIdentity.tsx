import { ImageWithFallback } from '../ui/ImageWithFallback'
import { cdnImageUrl } from '../../lib/cdn'
import { profilePath } from '../../routes/paths'
import type { Actor, ActorIdentity, ActorProfile, ActorReference } from '../../types'
import { Link } from 'react-router-dom'
import { useActorProfile } from '../../hooks/useActorProfile'

export function actorLabel(profile: ActorProfile): string {
  if (profile.displayName) return profile.displayName
  return actorHandle(profile.identity)
}

export function actorHandle(identity: ActorIdentity): string {
  return identity.handle === 'handle.invalid' ? identity.did : `@${identity.handle}`
}

type ActorAvatarSize = 'inline' | 'small' | 'row' | 'profile'

const actorAvatarSizeClass: Record<ActorAvatarSize, string> = {
  inline: 'size-4',
  small: 'size-6',
  row: 'size-8',
  profile: 'size-20',
}

export function ActorIdentityText({ profile }: { profile: ActorProfile }) {
  const handle = actorHandle(profile.identity)
  return (
    <Link
      to={profilePath(profile.identity.did)}
      className="group/actor min-w-0 rounded-ui-inner flex items-baseline gap-2"
    >
      <p className="truncate text-sm font-semibold tracking-[-0.01em] text-ui-text">{actorLabel(profile)}</p>
      <p className="truncate text-xs text-ui-muted group-hover/actor:text-ui-accent sm:text-sm">{handle}</p>
    </Link>
  )
}

export function ActorAvatar({
  actor,
  size,
  decorative = false,
}: {
  actor: Actor
  size: ActorAvatarSize
  decorative?: boolean
}) {
  const sizeClass = actorAvatarSizeClass[size]
  const profile = actor.kind === 'actorProfile' ? actor : undefined
  return (
    <ImageWithFallback
      src={profile?.avatarCid ? cdnImageUrl('avatar', profile.identity.did, profile.avatarCid) : undefined}
      alt={decorative || !profile ? '' : `${actorLabel(profile)}'s avatar`}
      title={actor.kind === 'actorReference' ? actor.did : undefined}
      fallback="avatar"
      className={`${sizeClass} shrink-0 rounded-ui-full bg-ui-subtle object-cover`}
      loading={size === 'profile' ? 'eager' : 'lazy'}
    />
  )
}

export function ActorReferenceText({ actor }: { actor: ActorReference }) {
  return (
    <Link
      to={profilePath(actor.did)}
      className="truncate rounded-ui-inner font-mono text-xs text-ui-text hover:text-ui-accent hover:underline"
    >
      {actor.did}
    </Link>
  )
}

export function ActorHandle({ actor, compact = false }: { actor: Actor; compact?: boolean }) {
  if (actor.kind === 'actorReference') {
    return <ActorReferenceText actor={actor} />
  }
  const handle = actorHandle(actor.identity)
  return (
    <Link
      to={profilePath(actor.identity.did)}
      className={`truncate rounded-ui-inner hover:text-ui-accent hover:underline ${compact ? 'text-xs font-normal text-ui-muted' : 'text-sm font-medium text-ui-text'}`}
    >
      {handle}
    </Link>
  )
}

export function MiniActor({
  actor,
  label,
  avatarSize = 'small',
}: {
  actor: ActorReference
  label?: string
  avatarSize?: 'inline' | 'small'
}) {
  const hydratedActor = useActorProfile(actor.did).data ?? actor
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-ui-muted">
      {label && <span>{label}</span>}
      <ActorAvatar actor={hydratedActor} size={avatarSize} decorative />
      <ActorHandle actor={hydratedActor} compact />
    </span>
  )
}
