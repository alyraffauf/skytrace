import { useQuery } from '@tanstack/react-query'
import { BlockRow } from './BlockRow'
import { LoadingRowContents } from '../records/LoadingRowContents'
import { compactRowClassName, UnavailableRow } from '../records/RecordList'
import type { PublicDataService } from '../../data/publicData'
import type { RelationshipEntry, UnavailableItem } from '../../types'

export function BlockedByRow({
  entry,
  subjectDid,
  service,
}: {
  entry: RelationshipEntry | UnavailableItem
  subjectDid: string
  service: PublicDataService
}) {
  const blockQuery = useQuery(
    service.graph.blockedByRecordQueryOptions(entry.kind === 'relationship' ? entry : undefined, subjectDid),
  )
  if (entry.kind === 'unavailable') return <BlockRow entry={entry} />
  if (blockQuery.isPending) {
    return (
      <div className={`${compactRowClassName} flex items-center gap-2.5`} aria-label="Loading block record">
        <LoadingRowContents />
      </div>
    )
  }
  if (blockQuery.isError) return <UnavailableRow reason="This block record could not be verified." />
  return <BlockRow entry={blockQuery.data} />
}
