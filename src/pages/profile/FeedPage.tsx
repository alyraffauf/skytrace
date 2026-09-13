import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FeedRow } from '../../components/feed/FeedRow'
import { RecordList } from '../../components/records/RecordList'
import { EmptyState } from '../../components/ui/States'
import { PagedQueryView } from '../../components/pagination/PagedQuery'
import { shouldHideProfilePosts } from '../../config/privacy'
import { mergeFeedItems } from '../../data/feedData'
import type { FeedPagingState } from '../../data/feedPaging'
import { queryKeys } from '../../data/queryKeys'
import { usePagedRecords } from '../../hooks/usePagedRecords'
import type { FeedItem } from '../../types'
import type { ProfileOutletContext } from '../../layouts/profileContext'
import { UnavailablePostsNotice } from '../../components/profile/UnavailablePostsNotice'

export function FeedPage() {
  const { profile } = useOutletContext<ProfileOutletContext>()
  if (shouldHideProfilePosts(profile)) return <UnavailablePostsNotice />
  return <FeedQuery />
}

function FeedQuery() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<FeedItem, FeedPagingState>(
    queryKeys.feed(profile.identity.did),
    (cursor, signal) => service.feed.feed(profile.identity, cursor, signal),
    { retry: false },
  )
  const items = useMemo(
    () => mergeFeedItems(query.data?.pages.flatMap((page) => page.items) ?? []),
    [query.data?.pages],
  )
  return (
    <PagedQueryView query={query} resourceLabel="feed" loadingCount={4}>
      {items.length === 0 ? (
        <EmptyState title="No posts or reposts found" />
      ) : (
        <RecordList>
          {items.map((item) => (
            <FeedRow key={item.kind === 'unavailable' ? item.id : item.uri} item={item} service={service} />
          ))}
        </RecordList>
      )}
    </PagedQueryView>
  )
}
