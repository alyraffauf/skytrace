import { ArrowPathRoundedSquareIcon, ListBulletIcon } from '@heroicons/react/24/outline'
import { Fragment, type ReactNode } from 'react'
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
import { isDid, parseAtUri, safeHttpUrl } from '../lib/parse'
import { profilePath } from '../lib/routes'
import type { Actor, Facet, FeedItem, FeedPost, UnavailableItem } from '../types'

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

function RichText({ text, facets, className }: { text: string; facets: Facet[]; className?: string }) {
  return (
    <p
      className={
        className ?? 'whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-zinc-800 dark:text-zinc-200'
      }
    >
      {splitFacetedText(text, facets).map((part, index) => {
        const externalHref = part.facet?.href && safeHttpUrl(part.facet.href)
        const mentionPath = part.facet?.mentionDid ? profilePath(part.facet.mentionDid) : undefined
        return mentionPath ? (
          <Link
            key={index}
            to={mentionPath}
            className="rounded text-rose-700 underline decoration-rose-200 underline-offset-2 hover:text-rose-900 dark:text-rose-300 dark:decoration-rose-900 dark:hover:text-rose-200"
          >
            {part.text}
          </Link>
        ) : externalHref ? (
          <a
            key={index}
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            className="rounded text-rose-700 underline decoration-rose-200 underline-offset-2 hover:text-rose-900 dark:text-rose-300 dark:decoration-rose-900 dark:hover:text-rose-200"
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

function PostBody({ post, quoted = false }: { post: FeedPost; quoted?: boolean }) {
  const authorDid = post.author.kind === 'actorProfile' ? post.author.identity.did : (parseAtUri(post.uri)?.did ?? '')
  const pds = post.repository?.pds ?? (post.author.kind === 'actorProfile' ? post.author.identity.pds : '')
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
                className="block focus-visible:outline-2 focus-visible:outline-rose-600"
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
      {post.video && pds && (
        <video
          className="mt-2 max-h-64 w-full bg-black"
          controls
          preload="none"
          aria-label={post.video.alt || 'Video attached to this post'}
        >
          <source src={pdsBlobUrl(pds, authorDid, post.video.cid)} type={post.video.mimeType || 'video/mp4'} />
          Your browser cannot play this video.
        </video>
      )}
      {post.quote && (
        <div className="mt-2 overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <QuotedPost post={post.quote} />
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

export function FeedRow({ item, footer }: { item: FeedItem; footer?: ReactNode }) {
  if (item.kind === 'unavailable') return <UnavailableFeedItem item={item} />
  const post = item.kind === 'repost' ? item.target : item
  if (post.kind === 'unavailable') {
    return (
      <div className="py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-2">
            <ArrowPathRoundedSquareIcon className="size-4" /> Reposted
          </span>
          <div className="flex items-center gap-1">
            {formatDateTime(item.createdAt)}
            <RecordLinksMenu recordUri={item.uri} label="repost record" />
          </div>
        </div>
        <UnavailableFeedItem item={post} />
      </div>
    )
  }
  if (post.author.kind === 'actorReference') {
    return (
      <HydratedActor actor={post.author}>
        {(author) => <FeedRowContent item={item} post={post} author={author} footer={footer} />}
      </HydratedActor>
    )
  }
  return <FeedRowContent item={item} post={post} author={post.author} footer={footer} />
}

function FeedRowContent({
  item,
  post,
  author,
  footer,
}: {
  item: Exclude<FeedItem, UnavailableItem>
  post: FeedPost
  author: FeedPost['author']
  footer?: ReactNode
}) {
  const postParts = parseAtUri(post.uri)
  const socialPath = postParts ? socialPostPath(postParts.did, postParts.rkey) : undefined
  return (
    <article className="feed-row py-2.5">
      {item.kind === 'repost' && <RepostByline item={item} />}
      {post.replyTo && <ReplyByline recordUri={post.replyTo} />}
      <div className="flex gap-3">
        {author.kind === 'actorProfile' ? (
          <ActorAvatar profile={author} size="row" decorative />
        ) : author.kind === 'actorReference' ? (
          <ActorReferenceAvatar actor={author} />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-100 dark:bg-zinc-900">
            <ListBulletIcon className="size-4 text-zinc-400 dark:text-zinc-500" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="relative mb-1 min-w-0 pr-10">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <FeedAuthor author={author} />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(post.createdAt)}</span>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <RecordLinksMenu
                recordUri={post.uri}
                socialPath={socialPath}
                label="post"
                relatedRecords={item.kind === 'repost' ? [{ uri: item.uri, label: 'Repost record' }] : undefined}
              />
            </div>
          </div>
          <PostBody post={post} />
          {footer}
        </div>
      </div>
    </article>
  )
}

function RepostByline({ item }: { item: Extract<FeedItem, { kind: 'repost' }> }) {
  if (item.author.kind === 'actorReference') {
    return (
      <HydratedActor actor={item.author}>
        {(author) => <RepostBylineContent item={item} author={author} />}
      </HydratedActor>
    )
  }
  return <RepostBylineContent item={item} author={item.author} />
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

function FeedAuthor({ author }: { author: FeedPost['author'] }) {
  if (author.kind === 'unavailable') {
    const did = isDid(author.id) ? author.id : undefined
    return (
      <span className="max-w-full truncate font-mono text-xs text-zinc-600 dark:text-zinc-400" title={did}>
        {did ?? 'Account unavailable'}
      </span>
    )
  }
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
