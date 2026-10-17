import type { GraphDataService } from '../../data/graphData'
import { queryKeys } from '../../data/queryKeys'
import { dedupeBy } from '../../lib/collections'
import { usePagedRecords } from '../../hooks/usePagedRecords'
import { PagedQueryView } from '../pagination/PagedQuery'
import { RecordList } from '../records/RecordList'
import { EmptyState, ErrorState, LoadingRows } from '../ui/States'
import { StreamedListMemberRow } from './StreamedMembershipRows'

export function ListMembers({ listUri, graph }: { listUri: string; graph: GraphDataService }) {
  const membersQuery = usePagedRecords<{ uri: string }>(queryKeys.listMembers(listUri), (cursor, signal) =>
    graph.listMembers(listUri, cursor, signal),
  )
  const members = dedupeBy(membersQuery.data?.pages.flatMap((page) => page.items) ?? [], (reference) => reference.uri)

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Members</h2>
        <span className="hidden w-[10.5rem] pr-[2.5rem] text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:block">
          Date added
        </span>
      </div>

      {membersQuery.isPending ? (
        <LoadingRows count={6} />
      ) : !membersQuery.data ? (
        <ErrorState error={membersQuery.error} retry={() => void membersQuery.refetch()} />
      ) : (
        <PagedQueryView query={membersQuery} resourceLabel="members">
          {membersQuery.isSuccess && members.length === 0 && <EmptyState title="No members found" />}
          {members.length > 0 && (
            <RecordList>
              {members.map((member) => (
                <StreamedListMemberRow key={member.uri} listUri={listUri} membershipUri={member.uri} graph={graph} />
              ))}
            </RecordList>
          )}
        </PagedQueryView>
      )}
    </>
  )
}
