import { useOutletContext } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { minimumListBlocking } from '../../config/listVisibility'
import { ListRow } from '../../components/lists/ListRow'
import { RecordList, UnavailableRow } from '../../components/records/RecordList'
import { MembershipLoadingRow } from '../../components/lists/StreamedMembershipRows'
import { EmptyState } from '../../components/ui/States'
import { PagedQueryView } from '../../components/pagination/PagedQuery'
import { queryKeys } from '../../data/queryKeys'
import { dedupeBy } from '../../lib/collections'
import { usePagedRecords } from '../../hooks/usePagedRecords'
import type { ProfileOutletContext } from '../../layouts/profileContext'

export function ListedOnPage() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<{ uri: string }>(
    queryKeys.profileTab(profile.identity.did, 'listedOn'),
    (cursor, signal) => service.graph.listedOnReferences(profile.identity.did, cursor, signal),
  )
  const memberships = dedupeBy(query.data?.pages.flatMap((page) => page.items) ?? [], (reference) => reference.uri)
  const minimumBlocking = minimumListBlocking()
  const membershipQueries = useQueries({
    queries: memberships.map((membership) =>
      service.graph.listedOnMembershipQueryOptions(membership.uri, minimumBlocking),
    ),
  })
  const allHidden = membershipQueries.every((membership) => membership.isSuccess && membership.data === null)
  return (
    <PagedQueryView query={query} resourceLabel="list memberships">
      {allHidden ? (
        <EmptyState
          title={minimumBlocking === undefined ? 'Not on any lists' : 'No lists match the visibility criteria'}
        />
      ) : (
        <RecordList>
          {membershipQueries.map((membership, index) => {
            const key = memberships[index]!.uri
            if (membership.isPending) return <MembershipLoadingRow key={key} />
            if (membership.isError)
              return <UnavailableRow key={key} reason="This list membership could not be loaded." />
            if (membership.data === null) return null
            if (membership.data.kind === 'unavailable')
              return <UnavailableRow key={key} reason={membership.data.reason} />
            return <ListRow key={key} list={membership.data.list} membership={membership.data} />
          })}
        </RecordList>
      )}
    </PagedQueryView>
  )
}
