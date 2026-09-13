import { LoadingRowContents } from './LoadingRowContents'
import { useQuery } from '@tanstack/react-query'
import { ListRow } from './ListRow'
import { RelationshipRow } from './RelationshipRow'
import { compactRowClassName, UnavailableRow } from './RecordList'
import type { PublicDataService } from '../data/publicData'

export function StreamedListMemberRow({
  listUri,
  membershipUri,
  service,
}: {
  listUri: string
  membershipUri: string
  service: PublicDataService
}) {
  const membershipQuery = useQuery(service.listMemberQueryOptions(listUri, membershipUri))
  if (membershipQuery.isPending) return <MembershipLoadingRow />
  if (membershipQuery.isError) return <UnavailableRow reason="This list membership could not be loaded." />
  return <RelationshipRow entry={membershipQuery.data} />
}

export function StreamedListedOnRow({ membershipUri, service }: { membershipUri: string; service: PublicDataService }) {
  const membershipQuery = useQuery(service.listedOnMembershipQueryOptions(membershipUri))
  if (membershipQuery.isPending) return <MembershipLoadingRow />
  if (membershipQuery.isError) return <UnavailableRow reason="This list membership could not be loaded." />
  if (membershipQuery.data.kind === 'unavailable') return <UnavailableRow reason={membershipQuery.data.reason} />
  return <ListRow list={membershipQuery.data.list} membership={membershipQuery.data} />
}

function MembershipLoadingRow() {
  return (
    <div className={`${compactRowClassName} flex items-center gap-2.5`} aria-label="Loading list membership">
      <LoadingRowContents />
    </div>
  )
}
