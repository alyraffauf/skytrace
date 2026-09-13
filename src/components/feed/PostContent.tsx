import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ImageWithFallback } from '../Images'
import { cdnImageUrl, pdsBlobUrl } from '../../lib/cdn'
import { parseAtUri, safeHttpUrl } from '../../lib/parse'
import { profilePath } from '../../routes/paths'
import type { Facet, FeedPost } from '../../types'

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

export function PostContent({
  post,
  children,
  quoted = false,
}: {
  post: FeedPost
  children?: ReactNode
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
      {children}
    </div>
  )
}
