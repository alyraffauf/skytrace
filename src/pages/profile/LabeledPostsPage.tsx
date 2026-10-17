import { useOutletContext } from 'react-router-dom'
import { LabeledPostRow } from '../../components/labels/LabeledPostRow'
import { useLabelDisplayNames } from '../../hooks/useLabelDisplayNames'
import { RecordList } from '../../components/records/RecordList'
import { EmptyState } from '../../components/ui/States'
import { PagedQueryView } from '../../components/pagination/PagedQuery'
import { shouldHideProfilePosts } from '../../config/privacy'
import { type LabeledPostsCursor } from '../../data/posts/labeledPostsData'
import { queryKeys } from '../../data/queryKeys'
import { mergeLabeledPosts } from '../../lib/posts/labeledPosts'
import { usePagedRecords } from '../../hooks/usePagedRecords'
import type { LabeledPost } from '../../types'
import type { ProfileOutletContext } from '../../layouts/profileContext'
import { UnavailablePostsNotice } from '../../components/profile/UnavailablePostsNotice'

export function LabeledPostsPage() {
  const { profile } = useOutletContext<ProfileOutletContext>()
  if (shouldHideProfilePosts(profile)) return <UnavailablePostsNotice />
  return <LabeledPostsQuery />
}

function LabeledPostsQuery() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<LabeledPost, LabeledPostsCursor>(
    queryKeys.labeledPosts(profile.identity.did),
    (cursor, signal) => service.labeledPosts.page(profile.identity, cursor, signal),
  )
  const items = mergeLabeledPosts(query.data?.pages.flatMap((page) => page.items) ?? [])
  const isSearching = items.length === 0 && query.hasNextPage
  const showEmptyState = items.length === 0 && !query.hasNextPage
  return (
    <PagedQueryView
      query={query}
      resourceLabel="labeled posts"
      loadingCount={4}
      paginationClassName={isSearching ? 'py-3' : undefined}
    >
      {items.length > 0 && (
        <RecordList>
          <ResolvedLabeledPostRows items={items} service={service} />
        </RecordList>
      )}
      {showEmptyState && <EmptyState title="No labeled posts found" />}
    </PagedQueryView>
  )
}

function ResolvedLabeledPostRows({
  items,
  service,
}: {
  items: LabeledPost[]
  service: ProfileOutletContext['service']
}) {
  const labels = items.flatMap((item) => item.labels)
  const displayNames = useLabelDisplayNames(labels, service)
  return items.map((item) => (
    <LabeledPostRow key={item.post.uri} item={item} displayNames={displayNames} service={service} />
  ))
}
