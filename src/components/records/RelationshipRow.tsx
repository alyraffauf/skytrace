import { ActorAvatar, ActorHandle, actorLabel } from '../actors/ActorIdentity'
import { useActorProfile } from '../../hooks/useActorProfile'
import { RecordLinksMenu } from './RecordLinksMenu'
import { formatDate } from '../../lib/dates'
import { socialProfilePath } from '../../lib/links'
import type { RelationshipEntry, UnavailableItem } from '../../types'
import { compactRowClassName, UnavailableRow } from './RecordList'

export function RelationshipRow({ entry }: { entry: RelationshipEntry | UnavailableItem }) {
  if (entry.kind === 'unavailable') {
    return <UnavailableRow reason={entry.reason} />
  }
  return <RelationshipRowContent entry={entry} />
}

function RelationshipRowContent({ entry }: { entry: RelationshipEntry }) {
  const actor = useActorProfile(entry.actor.did).data ?? entry.actor
  const date = formatDate(entry.createdAt)
  const did = actor.kind === 'actorReference' ? actor.did : actor.identity.did
  return (
    <article
      className={`${compactRowClassName} grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_2rem]`}
    >
      <ActorAvatar actor={actor} size="row" decorative />
      <div className="min-w-0 sm:contents">
        <div className="truncate">
          <ActorHandle actor={actor} />
        </div>
        <p className="mt-0.5 truncate text-xs text-ui-muted sm:mt-0 sm:text-right">{date ?? 'Date unknown'}</p>
      </div>
      <div>
        <RecordLinksMenu
          recordUri={entry.id}
          socialPath={socialProfilePath(did)}
          label={actor.kind === 'actorReference' ? actor.did : actorLabel(actor)}
        />
      </div>
    </article>
  )
}
