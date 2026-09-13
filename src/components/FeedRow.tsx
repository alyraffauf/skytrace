import { PostContent } from './PostContent'
import { QuotedPostPreview } from './QuotedPostPreview'
import { UnavailableFeedItem } from './UnavailableFeedItem'
import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline'
import { memo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ActorAvatar,
  ActorHandle,
  ActorIdentityText,
  ActorReferenceAvatar,
  ActorReferenceText,
  HydratedActor,
} from './ActorIdentity'
import { RecordLinksMenu } from './RecordLinksMenu'
import { formatDateTime } from '../lib/dates'
import { socialPathForAtUri, socialPostPath } from '../lib/links'
import { parseAtUri } from '../lib/parse'
import type { Actor, FeedItem, FeedPost, UnavailableItem } from '../types'
import type { PublicDataService } from '../data/publicData'

export const FeedRow = memo(function FeedRow({
  item,
  service,
  footer,
}: {
  item: FeedItem
  service?: PublicDataService
  footer?: ReactNode
}) {
  if (item.kind === 'unavailable') return <UnavailableFeedItem item={item} />
  if (item.kind === 'repost') return <StreamedRepost item={item} service={service} footer={footer} />
  return <ResolvedFeedRow post={item} service={service} footer={footer} />
})

function ResolvedFeedRow({
  post,
  repost,
  service,
  footer,
}: {
  post: FeedPost | UnavailableItem
  repost?: Extract<FeedItem, { kind: 'repost' }>
  service?: PublicDataService
  footer?: ReactNode
}) {
  if (post.kind === 'unavailable') {
    if (!repost) return <UnavailableFeedItem item={post} />
    return (
      <div className="py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-2">
            <ArrowPathRoundedSquareIcon className="size-4" /> Reposted
          </span>
          <div className="flex items-center gap-1">
            {formatDateTime(repost.createdAt)}
            <RecordLinksMenu recordUri={repost.uri} label="repost record" />
          </div>
        </div>
        <UnavailableFeedItem item={post} />
      </div>
    )
  }
  return (
    <HydratedActor actor={post.author}>
      {(author) => <FeedRowContent repost={repost} post={post} author={author} service={service} footer={footer} />}
    </HydratedActor>
  )
}

function FeedRowContent({
  repost,
  post,
  author,
  service,
  footer,
}: {
  repost?: Extract<FeedItem, { kind: 'repost' }>
  post: FeedPost
  author: Actor
  service?: PublicDataService
  footer?: ReactNode
}) {
  const postParts = parseAtUri(post.uri)
  const socialPath = postParts ? socialPostPath(postParts.did, postParts.rkey) : undefined
  return (
    <article className="feed-row py-2.5">
      {repost && <RepostByline item={repost} />}
      {post.replyTo && <ReplyByline recordUri={post.replyTo} />}
      <div className="flex gap-3">
        {author.kind === 'actorProfile' ? (
          <ActorAvatar profile={author} size="row" decorative />
        ) : (
          <ActorReferenceAvatar actor={author} />
        )}
        <div className="min-w-0 flex-1">
          <div className="relative mb-1 min-w-0 pr-10">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <FeedAuthor author={author} />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(post.createdAt)}</span>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <RecordLinksMenu recordUri={post.uri} socialPath={socialPath} label="post" />
            </div>
          </div>
          <PostContent post={post}>
            {post.quoteUri && service && (
              <div className="mt-2 overflow-hidden border border-zinc-200 dark:border-zinc-800">
                <QuotedPostPreview uri={post.quoteUri} service={service} />
              </div>
            )}
          </PostContent>
          {footer}
        </div>
      </div>
    </article>
  )
}

function StreamedRepost({
  item,
  service,
  footer,
}: {
  item: Extract<FeedItem, { kind: 'repost' }>
  service?: PublicDataService
  footer?: ReactNode
}) {
  if (!service)
    return (
      <UnavailableFeedItem item={{ kind: 'unavailable', id: item.subjectUri, reason: 'Reposted post unavailable.' }} />
    )
  return <ResolvedRepost item={item} service={service} footer={footer} />
}

function ResolvedRepost({
  item,
  service,
  footer,
}: {
  item: Extract<FeedItem, { kind: 'repost' }>
  service: PublicDataService
  footer?: ReactNode
}) {
  const targetQuery = useQuery(service.feedPostQueryOptions(item.subjectUri))
  if (targetQuery.isPending || !targetQuery.data)
    return <div className="py-5 text-sm text-zinc-500 dark:text-zinc-400">Loading reposted post…</div>
  return <ResolvedFeedRow repost={item} post={targetQuery.data} service={service} footer={footer} />
}

function RepostByline({ item }: { item: Extract<FeedItem, { kind: 'repost' }> }) {
  return (
    <HydratedActor actor={item.author}>{(author) => <RepostBylineContent item={item} author={author} />}</HydratedActor>
  )
}

function RepostBylineContent({ item, author }: { item: Extract<FeedItem, { kind: 'repost' }>; author: Actor }) {
  return (
    <div className="mb-1 flex min-w-0 items-center gap-1.5 pl-11 text-xs text-zinc-500 dark:text-zinc-400">
      <ArrowPathRoundedSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0">Reposted by</span>
      <ActorHandle actor={author} compact />
      <span className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500">{formatDateTime(item.createdAt)}</span>
    </div>
  )
}

function ReplyByline({ recordUri }: { recordUri: string }) {
  return (
    <div className="mb-1 flex items-center gap-1 pl-11 text-xs text-zinc-500 dark:text-zinc-400">
      Reply to a public post
      <div className="-my-2">
        <RecordLinksMenu recordUri={recordUri} socialPath={socialPathForAtUri(recordUri)} label="parent post" />
      </div>
    </div>
  )
}

function FeedAuthor({ author }: { author: Actor }) {
  if (author.kind === 'actorReference') return <ActorReferenceText actor={author} />

  return <ActorIdentityText profile={author} />
}
