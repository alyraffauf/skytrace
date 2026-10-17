import { segmentize } from '@atcute/bluesky-richtext-segmenter'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ImageWithFallback } from '../ui/ImageWithFallback'
import { cdnImageUrl, pdsBlobUrl } from '../../lib/cdn'
import { safeHttpUrl } from '../../lib/urls'
import { profilePath } from '../../routes/paths'
import type { Facet, FeedPost } from '../../types'

const richTextLinkClassName =
  'rounded text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900 dark:text-violet-300 dark:decoration-violet-900 dark:hover:text-violet-200'

function RichText({ text, facets, className }: { text: string; facets: Facet[]; className: string }) {
  return (
    <p className={className}>
      {segmentize(text, facets).map((part, index) => {
        let externalHref: string | undefined
        let mentionPath: string | undefined
        for (const feature of part.features ?? []) {
          if (feature.$type === 'app.bsky.richtext.facet#mention') mentionPath = profilePath(feature.did)
          else if (feature.$type === 'app.bsky.richtext.facet#link') externalHref = safeHttpUrl(feature.uri)
        }
        if (mentionPath) {
          return (
            <Link key={index} to={mentionPath} className={richTextLinkClassName}>
              {part.text}
            </Link>
          )
        }
        if (externalHref) {
          return (
            <a key={index} href={externalHref} target="_blank" rel="noreferrer" className={richTextLinkClassName}>
              {part.text}
            </a>
          )
        }
        return <Fragment key={index}>{part.text}</Fragment>
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
  const authorDid = post.author.did
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
              <a key={image.cid} href={imageUrl} target="_blank" rel="noreferrer" className="block">
                <ImageWithFallback
                  src={thumbnailUrl}
                  alt={image.alt || `Image ${index + 1} attached to this post`}
                  fallback="image"
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
