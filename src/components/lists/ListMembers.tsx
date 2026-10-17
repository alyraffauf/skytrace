import type { ListDataService } from '../../data/graph/listData'
import { queryKeys } from '../../data/queryKeys'
import { dedupeBy } from '../../lib/collections'
import { usePagedRecords } from '../../hooks/usePagedRecords'
import { PagedQueryView } from '../pagination/PagedQuery'
import { RecordList } from '../records/RecordList'
import { EmptyState } from '../ui/States'
import { StreamedListMemberRow } from './StreamedMembershipRows'
import type { Page } from '../../types'

export function ListMembers({ listUri, lists }: { listUri: string; lists: ListDataService }) {
  const membersQuery = usePagedRecords<{ uri: string }>(queryKeys.listMembers(listUri), (cursor, signal) =>
    lists.listMembers(listUri, cursor, signal),
  )
  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Members</h2>
        <span className="hidden w-[10.5rem] pr-[2.5rem] text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:block">
          Date added
        </span>
      </div>

      <PagedQueryView query={membersQuery} resourceLabel="members" loadingCount={6}>
        <ListMemberRows
          pages={membersQuery.data?.pages}
          showEmptyState={membersQuery.isSuccess}
          listUri={listUri}
          lists={lists}
        />
      </PagedQueryView>
    </>
  )
}

function ListMemberRows({
  pages,
  showEmptyState,
  listUri,
  lists,
}: {
  pages: Page<{ uri: string }>[] | undefined
  showEmptyState: boolean
  listUri: string
  lists: ListDataService
}) {
  const members = dedupeBy(pages?.flatMap((page) => page.items) ?? [], (reference) => reference.uri)
  if (members.length === 0) return showEmptyState ? <EmptyState title="No members found" /> : null
  return (
    <RecordList>
      {members.map((member) => (
        <StreamedListMemberRow key={member.uri} listUri={listUri} membershipUri={member.uri} lists={lists} />
      ))}
    </RecordList>
  )
}
