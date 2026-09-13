import { useOutletContext } from 'react-router-dom'
import { ListRow } from '../../components/lists/ListRow'
import { queryKeys } from '../../data/queryKeys'
import type { ListSummary, UnavailableItem } from '../../types'
import type { ProfileOutletContext } from '../../layouts/profileContext'
import { RecordTab } from '../../components/pagination/RecordTab'

export function ListsPage() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab<ListSummary | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'lists')}
      resourceLabel="lists"
      emptyTitle="No lists found"
      load={(cursor, signal) => service.graph.lists(profile.identity, cursor, signal)}
      itemKey={(item) => (item.kind === 'unavailable' ? item.id : item.uri)}
      renderItem={(item) => <ListRow list={item} />}
    />
  )
}
