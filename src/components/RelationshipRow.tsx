import { ActorAvatar, ActorHandle, ActorReferenceAvatar, actorLabel, HydratedActor } from './ActorIdentity'
import { RecordLinksMenu } from './RecordLinksMenu'
import { formatDate } from '../lib/dates'
import { socialProfilePath } from '../lib/links'
import type { ActorProfile, ActorReference, RelationshipEntry, UnavailableItem } from '../types'
import { compactRowClassName, UnavailableRow } from './RecordList'

export function RelationshipRow({ entry }: { entry: RelationshipEntry | UnavailableItem }) {
  if (entry.kind === 'unavailable') {
    return <UnavailableRow reason={entry.reason} />
  }
  if (entry.actor.kind === 'actorReference') {
    return (
      <HydratedActor actor={entry.actor}>
        {(actor) => <RelationshipRowContent entry={entry} actor={actor} />}
      </HydratedActor>
    )
  }
  return <RelationshipRowContent entry={entry} actor={entry.actor} />
}

function RelationshipRowContent({ entry, actor }: { entry: RelationshipEntry; actor: ActorProfile | ActorReference }) {
  const date = formatDate(entry.createdAt)
  const did = actor.kind === 'actorReference' ? actor.did : actor.identity.did
  return (
    <article
      className={`${compactRowClassName} group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_2rem]`}
    >
      {actor.kind === 'actorReference' ? (
        <ActorReferenceAvatar actor={actor} />
      ) : (
        <ActorAvatar profile={actor} size="row" decorative />
      )}
      <ActorHandle actor={actor} />
      <p className="col-start-2 row-start-2 truncate text-xs text-zinc-500 dark:text-zinc-400 sm:col-start-3 sm:row-start-1 sm:text-right">
        {date ?? 'Date unknown'}
      </p>
      <div className="col-start-3 row-span-2 row-start-1 sm:col-start-4 sm:row-span-1">
        <RecordLinksMenu
          recordUri={entry.id}
          socialPath={socialProfilePath(did)}
          label={actor.kind === 'actorReference' ? actor.did : actorLabel(actor)}
        />
      </div>
    </article>
  )
}
