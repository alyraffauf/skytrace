import { useQuery } from '@tanstack/react-query'
import { MiniActor } from '../actors/ActorIdentity'
import { RecordLinksMenu } from '../records/RecordLinksMenu'
import { PostContent } from './PostContent'
import { UnavailableFeedItem } from './UnavailableFeedItem'
import { formatDateTime } from '../../lib/dates'
import type { FeedPost } from '../../types'
import type { PublicDataService } from '../../data/publicData'
import { unavailable } from '../../data/recordResults'

export function QuotedPostPreview({ uri, service }: { uri: FeedPost['uri']; service: PublicDataService }) {
  const quoteQuery = useQuery(service.posts.feedPostQueryOptions(uri))
  if (quoteQuery.isPending) return <div className="p-2.5 text-sm text-ui-muted">Loading quoted post…</div>
  const post = quoteQuery.data ?? unavailable(uri, 'This post could not be loaded.')
  if (post.kind === 'unavailable') return <UnavailableFeedItem item={post} />
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-border px-3 py-2">
        <MiniActor actor={post.author} />
        <div className="flex items-center gap-1 text-xs text-ui-muted">
          {formatDateTime(post.createdAt)}
          <RecordLinksMenu recordUri={post.uri} label="quoted post" />
        </div>
      </div>
      <PostContent post={post} quoted />
    </>
  )
}
