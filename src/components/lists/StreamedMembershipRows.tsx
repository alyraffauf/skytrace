import { LoadingRowContents } from '../records/LoadingRowContents'
import { useQuery } from '@tanstack/react-query'
import { BlockRow } from '../blocks/BlockRow'
import { compactRowClassName, UnavailableRow } from '../records/RecordList'
import type { ListDataService } from '../../data/graph/listData'

export function StreamedListMemberRow({
  listUri,
  membershipUri,
  lists,
}: {
  listUri: string
  membershipUri: string
  lists: ListDataService
}) {
  const membershipQuery = useQuery(lists.listMemberQueryOptions(listUri, membershipUri))
  if (membershipQuery.isPending) return <MembershipLoadingRow />
  if (membershipQuery.isError) return <UnavailableRow reason="This list membership could not be loaded." />
  return <BlockRow entry={membershipQuery.data} />
}

export function MembershipLoadingRow() {
  return (
    <div className={`${compactRowClassName} flex items-center gap-2.5`} aria-label="Loading list membership">
      <LoadingRowContents />
    </div>
  )
}
