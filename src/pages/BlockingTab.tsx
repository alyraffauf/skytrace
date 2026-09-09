import { useOutletContext } from 'react-router-dom'
import { RelationshipRow } from '../components/RelationshipRow'
import { queryKeys } from '../data/queryKeys'
import type { ProfileOutletContext } from './ProfilePage'
import { RecordTab } from './RecordTab'

export function BlockingTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab
      queryKey={queryKeys.profileTab(profile.identity.did, 'blocking')}
      resourceLabel="blocked accounts"
      empty="No blocked accounts found"
      load={(cursor, signal) => service.blocking(profile.identity, cursor, signal)}
      itemKey={(item) => item.id}
      renderItem={(item) => <RelationshipRow entry={item} />}
    />
  )
}
