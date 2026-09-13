import { useQuery } from '@tanstack/react-query'
import { RelationshipRow } from './RelationshipRow'
import type { PublicDataService } from '../data/publicData'
import type { RelationshipEntry, UnavailableItem } from '../types'

export function StreamedBlockedByRow({
  entry,
  service,
}: {
  entry: RelationshipEntry | UnavailableItem
  service: PublicDataService
}) {
  const blockDateQuery = useQuery(service.blockDateQueryOptions(entry.id))
  const datedEntry =
    entry.kind === 'relationship' && blockDateQuery.data ? { ...entry, createdAt: blockDateQuery.data } : entry
  return <RelationshipRow entry={datedEntry} />
}
