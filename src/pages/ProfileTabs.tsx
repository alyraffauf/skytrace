import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FeedRow } from '../components/FeedRow'
import { LabeledPostRow } from '../components/LabeledPostRow'
import { useLabelDisplayNames } from '../components/LabelValue'
import { ListRow } from '../components/ListRow'
import { RecordList } from '../components/RecordList'
import { StreamedListedOnRow } from '../components/StreamedMembershipRows'
import { RelationshipRow } from '../components/RelationshipRow'
import { StreamedBlockedByRow } from '../components/StreamedRelationshipRow'
import { EmptyState } from '../components/States'
import { PagedQueryView } from '../components/PagedQuery'
import { shouldHideProfilePosts } from '../config/privacy'
import { mergeFeedItems, type LabeledPostsCursor } from '../data/publicData'
import type { FeedPagingState } from '../data/feedPaging'
import { queryKeys } from '../data/queryKeys'
import { compareLabeledPostsNewestFirst, timestampFor } from '../lib/sorting'
import { dedupeBy } from '../lib/collections'
import { usePagedRecords } from '../lib/usePagedRecords'
import type { FeedItem, LabelEvent, LabeledPost, ListSummary, RelationshipEntry, UnavailableItem } from '../types'
import type { ProfileOutletContext } from './ProfilePage'
import { RecordTab } from './RecordTab'

export { LabelsTab } from './LabelsTab'

export function BlockingTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab
      queryKey={queryKeys.profileTab(profile.identity.did, 'blocking')}
      resourceLabel="blocked accounts"
      emptyTitle="No blocked accounts found"
      load={(cursor, signal) => service.graph.blocking(profile.identity, cursor, signal)}
      itemKey={(item) => item.id}
      renderItem={(item) => <RelationshipRow entry={item} />}
    />
  )
}

export function BlockedByTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab<RelationshipEntry | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'blockedBy')}
      resourceLabel="accounts blocking this profile"
      emptyTitle="No accounts blocking this profile"
      load={(cursor, signal) => service.graph.blockedBy(profile.identity.did, cursor, signal)}
      itemKey={(item) => item.id}
      renderItem={(item) => <StreamedBlockedByRow entry={item} service={service} />}
    />
  )
}

export function ListsTab() {
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

export function ListedOnTab() {
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

export function LabeledPostsTab() {
  const { profile } = useOutletContext<ProfileOutletContext>()
  if (shouldHideProfilePosts(profile)) return <UnavailablePostsNotice />
  return <LabeledPostsQuery />
}

function LabeledPostsQuery() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<LabeledPost, LabeledPostsCursor>(
    queryKeys.labeledPosts(profile.identity.did),
    (cursor, signal) => service.feed.labeledPosts(profile.identity, cursor, signal),
    { retry: false },
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
  const displayNames = useLabelDisplayNames(
    items.flatMap((item) => item.labels),
    service,
  )
  return items.map((item) => (
    <LabeledPostRow key={item.post.uri} item={item} displayNames={displayNames} service={service} />
  ))
}

// Keep the first-seen post when a later page adds no labels.
export function mergeLabeledPosts(items: LabeledPost[]): LabeledPost[] {
  const posts = new Map<string, LabeledPost>()
  for (const item of items) {
    const current = posts.get(item.post.uri)
    if (!current) {
      posts.set(item.post.uri, item)
      continue
    }
    const labels = new Map<string, LabelEvent>()
    for (const label of [...current.labels, ...item.labels]) labels.set(label.id, label)
    if (labels.size === current.labels.length) continue
    posts.set(item.post.uri, {
      ...current,
      labels: [...labels.values()].sort((left, right) => timestampFor(right.createdAt) - timestampFor(left.createdAt)),
    })
  }
  return [...posts.values()].sort(compareLabeledPostsNewestFirst)
}

export function FeedTab() {
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

function UnavailablePostsNotice() {
  return (
    <EmptyState className="mt-8 border-none py-12 sm:mt-12" title="Posts aren't available here">
      This account has chosen not to show its posts on public sites like SkyTrace.
    </EmptyState>
  )
}
