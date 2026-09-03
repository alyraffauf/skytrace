import { Fragment, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FeedRow } from '../components/FeedRow'
import { InfiniteScroll } from '../components/InfiniteScroll'
import { groupLabelHistory, LabelRow, type LabelHistoryEvent } from '../components/LabelRow'
import { LabeledPostRow } from '../components/LabeledPostRow'
import { useLabelDisplayNames } from '../components/LabelValue'
import { ListRow } from '../components/ListRow'
import { RecordList } from '../components/RecordList'
import { RelationshipRow } from '../components/RelationshipRow'
import { EmptyState, ErrorState, LoadingRows, UnavailableCard } from '../components/States'
import { mergeFeedItems, type LabeledPostsCursor } from '../data/publicData'
import type { FeedPagingState } from '../data/feedPaging'
import type { LabelPagingState } from '../data/labelPaging'
import { queryKeys } from '../data/queryKeys'
import { newestFirst, timestampFor } from '../lib/sorting'
import { usePagedRecords } from '../lib/usePagedRecords'
import type {
  FeedItem,
  LabelEvent,
  LabeledPost,
  ListMembership,
  ListSummary,
  Page,
  RelationshipEntry,
  SourceIssue,
  UnavailableItem,
} from '../types'
import type { ProfileOutletContext } from './ProfilePage'

type DatedTabItem = LabelEvent | ListMembership | ListSummary | RelationshipEntry | UnavailableItem

type PagedTabProps<T extends DatedTabItem, TCursor = string> = {
  queryKey: readonly unknown[]
  empty: string
  load: (cursor: TCursor | undefined, signal: AbortSignal) => Promise<Page<T, TCursor>>
  render: (item: T) => React.ReactNode
  itemKey: (item: T) => string
  transformItems?: (items: T[]) => T[]
  prefetchNextPage?: boolean
}

function PagedTab<T extends DatedTabItem, TCursor = string>({
  queryKey,
  empty,
  load,
  render,
  itemKey,
  transformItems,
  prefetchNextPage = false,
}: PagedTabProps<T, TCursor>) {
  const query = usePagedRecords(queryKey, load)
  useEffect(() => {
    if (prefetchNextPage && query.data?.pages.length === 1 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }, [prefetchNextPage, query.data?.pages.length, query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])
  if (query.isPending) return <LoadingRows />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const loadedItems = newestFirst(
    Array.from(new Map(query.data.pages.flatMap((page) => page.items).map((item) => [itemKey(item), item])).values()),
  )
  const items = transformItems ? transformItems(loadedItems) : loadedItems
  const issues = query.data.pages.at(-1)?.issues ?? []
  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <RecordList>
          {items.map((item) => (
            <Fragment key={itemKey(item)}>{render(item)}</Fragment>
          ))}
        </RecordList>
      )}
      {issues.length > 0 && <SourceIssues issues={issues} retry={() => void query.fetchNextPage()} />}
      <InfiniteScroll
        hasMore={query.hasNextPage && issues.length === 0}
        loading={query.isFetchingNextPage}
        error={query.isFetchNextPageError ? query.error : undefined}
        load={() => void query.fetchNextPage()}
      />
    </div>
  )
}

export function LabelsTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <PagedTab<LabelHistoryEvent | UnavailableItem, LabelPagingState>
      queryKey={queryKeys.profileTab(profile.identity.did, 'labels')}
      empty="No account labels found"
      load={(cursor, signal) => service.labels(profile.identity.did, cursor, signal)}
      itemKey={(item) => item.id}
      transformItems={groupLabelHistory}
      prefetchNextPage
      render={(item) => <ResolvedLabelRow item={item} service={service} />}
    />
  )
}

function ResolvedLabelRow({
  item,
  service,
}: {
  item: LabelHistoryEvent | UnavailableItem
  service: ProfileOutletContext['service']
}) {
  const label = item.kind === 'labelEvent' ? item : undefined
  const displayNames = useLabelDisplayNames(label ? [label] : [], service)
  return <LabelRow label={item} displayName={label ? displayNames.get(label.id) : undefined} />
}

function RelationshipTab({ direction }: { direction: 'blocking' | 'blockedBy' }) {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <PagedTab<RelationshipEntry | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, direction)}
      empty={direction === 'blocking' ? 'No blocked accounts found' : 'No accounts blocking this profile'}
      load={(cursor, signal) =>
        direction === 'blocking'
          ? service.blocking(profile.identity, cursor, signal)
          : service.blockedBy(profile.identity.did, cursor, signal)
      }
      itemKey={(item) => item.id}
      render={(item) => <RelationshipRow entry={item} />}
    />
  )
}

export function BlockingTab() {
  return <RelationshipTab direction="blocking" />
}
export function BlockedByTab() {
  return <RelationshipTab direction="blockedBy" />
}

export function ListsTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <PagedTab<ListSummary | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'lists')}
      empty="No lists found"
      load={(cursor, signal) => service.lists(profile.identity, cursor, signal)}
      itemKey={(item) => (item.kind === 'unavailable' ? item.id : item.uri)}
      render={(item) => <ListRow list={item} />}
    />
  )
}

export function ListedOnTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  return (
    <PagedTab<ListMembership | UnavailableItem>
      queryKey={queryKeys.profileTab(profile.identity.did, 'listedOn')}
      empty="Not on any lists"
      load={(cursor, signal) => service.listedOn(profile.identity.did, cursor, signal)}
      itemKey={(item) => (item.kind === 'unavailable' ? item.id : item.uri)}
      render={(item) =>
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
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<LabeledPost, LabeledPostsCursor>(
    queryKeys.labeledPosts(profile.identity.did),
    (cursor, signal) => service.labeledPosts(profile.identity, cursor, signal),
  )
  if (query.isPending) return <LoadingRows count={4} />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const items = mergeLabeledPosts(query.data.pages.flatMap((page) => page.items))
  const issues = query.data.pages.at(-1)?.issues ?? []
  const paginationError = query.isFetchNextPageError ? query.error : undefined
  if (items.length === 0) {
    if (issues.length > 0) return <SourceIssues issues={issues} retry={() => void query.fetchNextPage()} />
    if (!query.hasNextPage) return <EmptyState title="No labeled posts found" />
    return (
      <div className="border-b border-zinc-200 py-3 dark:border-zinc-800">
        <InfiniteScroll
          hasMore
          loading={query.isFetchingNextPage}
          error={paginationError}
          load={() => void query.fetchNextPage()}
        />
      </div>
    )
  }
  return (
    <div>
      <RecordList>
        {items.map((item) => (
          <ResolvedLabeledPostRow key={item.uri} item={item} service={service} />
        ))}
      </RecordList>
      {issues.length > 0 && <SourceIssues issues={issues} retry={() => void query.fetchNextPage()} />}
      <InfiniteScroll
        hasMore={query.hasNextPage && issues.length === 0}
        loading={query.isFetchingNextPage}
        error={paginationError}
        load={() => void query.fetchNextPage()}
      />
    </div>
  )
}

function ResolvedLabeledPostRow({ item, service }: { item: LabeledPost; service: ProfileOutletContext['service'] }) {
  const displayNames = useLabelDisplayNames(item.labels, service)
  return <LabeledPostRow item={item} displayNames={displayNames} />
}

function mergeLabeledPosts(items: LabeledPost[]): LabeledPost[] {
  const posts = new Map<string, LabeledPost>()
  for (const item of items) {
    const current = posts.get(item.uri)
    if (!current) {
      posts.set(item.uri, item)
      continue
    }
    const labels = Array.from(
      new Map([...current.labels, ...item.labels].map((label) => [label.id, label])).values(),
    ).sort((left, right) => timestampFor(right.createdAt) - timestampFor(left.createdAt))
    posts.set(item.uri, {
      ...current,
      post: current.post.kind === 'unavailable' ? item.post : current.post,
      labels,
    })
  }
  return [...posts.values()].sort((left, right) => {
    const leftDate = timestampFor(left.post.kind === 'post' ? left.post.createdAt : left.labels[0]?.createdAt)
    const rightDate = timestampFor(right.post.kind === 'post' ? right.post.createdAt : right.labels[0]?.createdAt)
    return rightDate - leftDate || left.uri.localeCompare(right.uri)
  })
}

function SourceIssues({ issues, retry }: { issues: SourceIssue[]; retry: () => void }) {
  const sources = new Set(issues.map((issue) => issue.source)).size
  return (
    <div
      role="status"
      className="flex min-h-11 items-center justify-between border-b border-amber-300 bg-amber-50 px-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <span>
        {sources} {sources === 1 ? 'source' : 'sources'} unavailable
      </span>
      <button
        type="button"
        onClick={retry}
        className="min-h-10 px-2 font-semibold text-violet-800 hover:underline dark:text-violet-300"
      >
        Retry
      </button>
    </div>
  )
}

export function FeedTab() {
  const { profile, service } = useOutletContext<ProfileOutletContext>()
  const query = usePagedRecords<FeedItem, FeedPagingState>(queryKeys.feed(profile.identity.did), (cursor, signal) =>
    service.feed(profile.identity, cursor, signal),
  )
  const items = useMemo(
    () => mergeFeedItems(query.data?.pages.flatMap((page) => page.items) ?? []),
    [query.data?.pages],
  )
  if (query.isPending) return <LoadingRows count={4} />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  return (
    <div>
      {items.length === 0 ? (
        <EmptyState title="No posts or reposts found" />
      ) : (
        <RecordList>
          {items.map((item) => (
            <FeedRow key={item.kind === 'unavailable' ? item.id : item.uri} item={item} />
          ))}
        </RecordList>
      )}
      <InfiniteScroll
        hasMore={query.hasNextPage}
        loading={query.isFetchingNextPage}
        error={query.isFetchNextPageError ? query.error : undefined}
        load={() => void query.fetchNextPage()}
      />
    </div>
  )
}
