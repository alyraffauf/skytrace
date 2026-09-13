import { useQuery } from '@tanstack/react-query'
import { MiniActor } from './ActorIdentity'
import { RecordLinksMenu } from './RecordLinksMenu'
import { PostContent } from './PostContent'
import { UnavailableFeedItem } from './UnavailableFeedItem'
import { formatDateTime } from '../lib/dates'
import { socialPathForAtUri } from '../lib/links'
import type { FeedPost, UnavailableItem } from '../types'
import type { PublicDataService } from '../data/publicData'

export function QuotedPostPreview({ uri, service }: { uri: FeedPost['uri']; service: PublicDataService }) {
  const quoteQuery = useQuery(service.feedPostQueryOptions(uri))
  if (quoteQuery.isPending)
    return <div className="p-2.5 text-sm text-zinc-500 dark:text-zinc-400">Loading quoted post…</div>
  if (!quoteQuery.data) return null
  return <QuotedPost post={quoteQuery.data} />
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
      <PostContent post={post} quoted />
    </div>
  )
}
