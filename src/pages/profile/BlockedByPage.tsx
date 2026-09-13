import { useOutletContext } from 'react-router-dom'
import { BlockedByRow } from '../../components/blocks/BlockedByRow'
import { queryKeys } from '../../data/queryKeys'
import type { RelationshipEntry, UnavailableItem } from '../../types'
import type { ProfileOutletContext } from '../../layouts/profileContext'
import { RecordTab } from '../../components/pagination/RecordTab'

export function BlockedByPage() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab<RelationshipEntry | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'blockedBy')}
      resourceLabel="accounts blocking this profile"
      emptyTitle="No accounts blocking this profile"
      load={(cursor, signal) => service.graph.blockedBy(profile.identity.did, cursor, signal)}
      itemKey={(item) => item.id}
      renderItem={(item) => <BlockedByRow entry={item} service={service} />}
    />
  )
}
