import { AppBskyFeedPost } from '@atcute/bluesky'
import type { ActorIdentity, FeedPost, RawRecord, UnavailableItem } from '../types'
import { actorFromAtUri, parseAtUri } from '../lib/parse'
import { actorReference, unavailable } from './recordResults'
import { blobCid, objectValue, parseFacets, parseImages, parsedRecord, stringValue } from './recordParsers'

export function decodePostRecord(record: RawRecord): Omit<FeedPost, 'repositoryPds'> | UnavailableItem {
  const authorDid = actorFromAtUri(record.uri)
  const value = parsedRecord(AppBskyFeedPost.mainSchema, record)
  if (!authorDid || !value) return unavailable(record.uri, 'This post is malformed or unavailable.')
  const embed = objectValue(value.embed)
  let mediaEmbed = embed
  let quoteUri: string | undefined
  if (embed?.['$type'] === 'app.bsky.embed.recordWithMedia') {
    mediaEmbed = objectValue(embed.media)
    quoteUri = stringValue(objectValue(objectValue(embed.record)?.record)?.uri)
  } else if (embed?.['$type'] === 'app.bsky.embed.record') {
    quoteUri = stringValue(objectValue(embed.record)?.uri)
  }
  const video =
    mediaEmbed?.['$type'] === 'app.bsky.embed.video'
      ? {
          cid: blobCid(mediaEmbed.video),
          alt: stringValue(mediaEmbed.alt),
          mimeType: stringValue(objectValue(mediaEmbed.video)?.mimeType),
        }
      : undefined
  const reply = objectValue(value.reply)
  const rawReplyTo = stringValue(objectValue(reply?.parent)?.uri)
  const replyTo = rawReplyTo && parseAtUri(rawReplyTo) ? (rawReplyTo as FeedPost['uri']) : undefined
  const author = actorReference(authorDid as ActorIdentity['did'])
  return {
    kind: 'post',
    uri: record.uri,
    author,
    createdAt: value.createdAt,
    text: value.text,
    facets: parseFacets(value.text, value.facets),
    replyTo,
    quoteUri: quoteUri && parseAtUri(quoteUri) ? (quoteUri as FeedPost['uri']) : undefined,
    images: parseImages(mediaEmbed),
    video: video?.cid ? { cid: video.cid, alt: video.alt, mimeType: video.mimeType } : undefined,
  }
}
