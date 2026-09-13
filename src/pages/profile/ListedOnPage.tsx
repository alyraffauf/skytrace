import { useOutletContext } from 'react-router-dom'
import { RecordList } from '../../components/records/RecordList'
import { StreamedListedOnRow } from '../../components/lists/StreamedMembershipRows'
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
  return (
    <PagedQueryView query={query} resourceLabel="list memberships">
      {memberships.length === 0 ? (
        <EmptyState title="Not on any lists" />
      ) : (
        <RecordList>
          {memberships.map((membership) => (
            <StreamedListedOnRow key={membership.uri} membershipUri={membership.uri} service={service} />
          ))}
        </RecordList>
      )}
    </PagedQueryView>
  )
}
