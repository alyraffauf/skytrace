import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FeedRow } from '../components/FeedRow'
import { PagedQueryView } from '../components/PagedQuery'
import { LabeledPostRow } from '../components/LabeledPostRow'
import { useLabelDisplayNames } from '../components/LabelValue'
import { ListRow } from '../components/ListRow'
import { RecordList } from '../components/RecordList'
import { RelationshipRow } from '../components/RelationshipRow'
import { EmptyState, UnavailableCard } from '../components/States'
import { shouldHideProfilePosts } from '../config/privacy'
import { mergeFeedItems, type LabeledPostsCursor } from '../data/publicData'
import type { FeedPagingState } from '../data/feedPaging'
import { queryKeys } from '../data/queryKeys'
import { timestampFor } from '../lib/sorting'
import { usePagedRecords } from '../lib/usePagedRecords'
import type { FeedItem, LabeledPost, ListMembership, ListSummary, RelationshipEntry, UnavailableItem } from '../types'
import type { ProfileOutletContext } from './ProfilePage'
import { RecordTab } from './RecordTab'

export { BlockingTab } from './BlockingTab'
export { LabelsTab } from './LabelsTab'

export function BlockedByTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab<RelationshipEntry | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'blockedBy')}
      resourceLabel="accounts blocking this profile"
      empty="No accounts blocking this profile"
      load={(cursor, signal) => service.blockedBy(profile.identity.did, cursor, signal)}
      itemKey={(item) => item.id}
      renderItem={(item) => <RelationshipRow entry={item} />}
    />
  )
}

export function ListsTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab<ListSummary | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'lists')}
      resourceLabel="lists"
      empty="No lists found"
      load={(cursor, signal) => service.lists(profile.identity, cursor, signal)}
      itemKey={(item) => (item.kind === 'unavailable' ? item.id : item.uri)}
      renderItem={(item) => <ListRow list={item} />}
    />
  )
}

export function ListedOnTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <RecordTab<ListMembership | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'listedOn')}
      resourceLabel="list memberships"
      empty="Not on any lists"
      load={(cursor, signal) => service.listedOn(profile.identity.did, cursor, signal)}
      itemKey={(item) => (item.kind === 'unavailable' ? item.id : item.uri)}
      renderItem={(item) =>
        item.kind === 'unavailable' ? (
          <UnavailableCard reason={item.reason} />
        ) : (
          <ListRow list={item.list} membership={item} />
        )
      }
    />
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
    (cursor, signal) => service.labeledPosts(profile.identity, cursor, signal),
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
      paginationClassName={isSearching ? 'border-b border-zinc-200 py-3 dark:border-zinc-800' : undefined}
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
  return items.map((item) => <LabeledPostRow key={item.post.uri} item={item} displayNames={displayNames} />)
}

function mergeLabeledPosts(items: LabeledPost[]): LabeledPost[] {
  const posts = new Map<string, LabeledPost>()
  for (const item of items) {
    const current = posts.get(item.post.uri)
    if (!current) {
      posts.set(item.post.uri, item)
      continue
    }
    const labels = Array.from(
      new Map([...current.labels, ...item.labels].map((label) => [label.id, label])).values(),
    ).sort((left, right) => timestampFor(right.createdAt) - timestampFor(left.createdAt))
    posts.set(item.post.uri, {
      ...current,
      labels,
    })
  }
  return [...posts.values()].sort((left, right) => {
    const leftDate = timestampFor(left.post.createdAt)
    const rightDate = timestampFor(right.post.createdAt)
    return rightDate - leftDate || left.post.uri.localeCompare(right.post.uri)
  })
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
    (cursor, signal) => service.feed(profile.identity, cursor, signal),
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
            <FeedRow key={item.kind === 'unavailable' ? item.id : item.uri} item={item} />
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
