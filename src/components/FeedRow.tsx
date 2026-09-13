import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline'
import { Fragment, memo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ActorAvatar,
  ActorHandle,
  ActorIdentityText,
  ActorReferenceAvatar,
  ActorReferenceText,
  HydratedActor,
  MiniActor,
} from './ActorIdentity'
import { ImageWithFallback } from './Images'
import { RecordLinksMenu } from './RecordLinksMenu'
import { cdnImageUrl, pdsBlobUrl } from '../lib/cdn'
import { formatDateTime } from '../lib/dates'
import { socialPathForAtUri, socialPostPath } from '../lib/links'
import { parseAtUri, safeHttpUrl } from '../lib/parse'
import { profilePath } from '../lib/routes'
import type { Actor, Facet, FeedItem, FeedPost, UnavailableItem } from '../types'
import type { PublicDataService } from '../data/publicData'

type TextPart = { text: string; facet?: Facet }

export function splitFacetedText(text: string, facets: Facet[]): TextPart[] {
  const bytes = new TextEncoder().encode(text)
  const decoder = new TextDecoder()
  const validFacets = facets
    .filter((facet) => facet.byteStart >= 0 && facet.byteEnd > facet.byteStart && facet.byteEnd <= bytes.length)
    .sort((left, right) => left.byteStart - right.byteStart)
  const parts: TextPart[] = []
  let position = 0
  for (const facet of validFacets) {
    if (facet.byteStart < position) continue
    if (facet.byteStart > position) parts.push({ text: decoder.decode(bytes.slice(position, facet.byteStart)) })
    parts.push({ text: decoder.decode(bytes.slice(facet.byteStart, facet.byteEnd)), facet })
    position = facet.byteEnd
  }
  if (position < bytes.length) parts.push({ text: decoder.decode(bytes.slice(position)) })
  return parts
}

function RichText({ text, facets, className }: { text: string; facets: Facet[]; className: string }) {
  return (
    <p className={className}>
      {splitFacetedText(text, facets).map((part, index) => {
        const externalHref = part.facet?.href && safeHttpUrl(part.facet.href)
        const mentionPath = part.facet?.mentionDid ? profilePath(part.facet.mentionDid) : undefined
        return mentionPath ? (
          <Link
            key={index}
            to={mentionPath}
            className="rounded text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900 dark:text-violet-300 dark:decoration-violet-900 dark:hover:text-violet-200"
          >
            {part.text}
          </Link>
        ) : externalHref ? (
          <a
            key={index}
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            className="rounded text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900 dark:text-violet-300 dark:decoration-violet-900 dark:hover:text-violet-200"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      })}
    </p>
  )
}

function PostBody({
  post,
  service,
  quoted = false,
}: {
  post: FeedPost
  service?: PublicDataService
  quoted?: boolean
}) {
  const authorDid = parseAtUri(post.uri)?.did ?? ''
  return (
    <div className={quoted ? 'p-2.5' : ''}>
      <RichText
        text={post.text}
        facets={post.facets}
        className={`${quoted ? 'line-clamp-3 ' : ''}whitespace-pre-wrap break-words text-sm leading-5 text-zinc-800 dark:text-zinc-200`}
      />
      {post.images && (
        <div
          className={`mt-2 grid gap-px overflow-hidden border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800 ${post.images.length > 1 ? 'grid-cols-2' : ''}`}
        >
          {post.images.map((image, index) => {
            const imageUrl = cdnImageUrl('feed_fullsize', authorDid, image.cid)
            const thumbnailUrl = cdnImageUrl('feed_thumbnail', authorDid, image.cid)
            return (
              <a
                key={image.cid}
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="block focus-visible:outline-2 focus-visible:outline-violet-600"
              >
                <ImageWithFallback
                  src={thumbnailUrl}
                  alt={image.alt || `Image ${index + 1} attached to this post`}
                  fallback="image"
                  fallbackClassName="h-36 w-full sm:h-48"
                  className="h-36 w-full bg-zinc-100 object-cover dark:bg-zinc-900 sm:h-48"
                  loading="lazy"
                />
              </a>
            )
          })}
        </div>
      )}
      {post.video && post.repositoryPds && (
        <video
          className="mt-2 max-h-64 w-full bg-black"
          controls
          preload="none"
          aria-label={post.video.alt || 'Video attached to this post'}
        >
          <source
            src={pdsBlobUrl(post.repositoryPds, authorDid, post.video.cid)}
            type={post.video.mimeType || 'video/mp4'}
          />
          Your browser cannot play this video.
        </video>
      )}
      {post.quoteUri && service && (
        <div className="mt-2 overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <StreamedQuotedPost uri={post.quoteUri} service={service} />
        </div>
      )}
    </div>
  )
}

function QuotedPost({ post }: { post: FeedPost | UnavailableItem }) {
  if (post.kind === 'unavailable') return <UnavailableFeedItem item={post} />
  const socialPath = socialPathForAtUri(post.uri)
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <MiniActor actor={post.author} />
        <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
          {formatDateTime(post.createdAt)}
          <RecordLinksMenu recordUri={post.uri} socialPath={socialPath} label="quoted post" />
        </div>
      </div>
      <PostBody post={post} quoted />
    </div>
  )
}

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
          <PostBody post={post} service={service} />
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

function StreamedQuotedPost({ uri, service }: { uri: FeedPost['uri']; service: PublicDataService }) {
  const quoteQuery = useQuery(service.feedPostQueryOptions(uri))
  if (quoteQuery.isPending)
    return <div className="p-2.5 text-sm text-zinc-500 dark:text-zinc-400">Loading quoted post…</div>
  if (!quoteQuery.data) return null
  return <QuotedPost post={quoteQuery.data} />
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

  return <ActorIdentityText profile={author} inline />
}

function UnavailableFeedItem({ item }: { item: UnavailableItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
      <span>{item.reason}</span>
      <RecordLinksMenu recordUri={item.id} socialPath={socialPathForAtUri(item.id)} label="unavailable record" />
    </div>
  )
}
