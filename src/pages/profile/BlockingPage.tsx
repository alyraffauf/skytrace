import { useOutletContext } from 'react-router-dom'
import { BlockRow } from '../../components/blocks/BlockRow'
import { queryKeys } from '../../data/queryKeys'
import type { ProfileOutletContext } from '../../layouts/profileContext'
import { RecordTab } from '../../components/pagination/RecordTab'

export function BlockingPage() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab
      queryKey={queryKeys.profileTab(profile.identity.did, 'blocking')}
      resourceLabel="blocked accounts"
      emptyTitle="No blocked accounts found"
      load={(cursor, signal) => service.graph.blocking(profile.identity, cursor, signal)}
      itemKey={(item) => item.id}
      renderItem={(item) => <BlockRow entry={item} />}
    />
  )
}
