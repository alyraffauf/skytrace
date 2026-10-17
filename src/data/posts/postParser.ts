import { AppBskyFeedPost } from '@atcute/bluesky'
import { isDid } from '@atcute/lexicons/syntax'
import type { ActorIdentity, Facet, FeedImage, FeedPost, RawRecord, UnavailableItem } from '../../types'
import { actorFromAtUri, parseAtUri } from '../../lib/atproto/uri'
import { actorReference, unavailable } from '../recordResults'
import { blobCid, objectValue, parsedRecord, stringValue } from '../recordValues'

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

export function parseFacets(text: string, value: unknown): Facet[] {
  if (!Array.isArray(value)) return []
  const encodedText = new TextEncoder().encode(text)
  const strictDecoder = new TextDecoder('utf-8', { fatal: true })
  return value.flatMap((rawFacet) => {
    const facet = objectValue(rawFacet)
    const index = objectValue(facet?.index)
    const features = facet?.features
    const byteStart = index?.byteStart
    const byteEnd = index?.byteEnd
    if (!Number.isInteger(byteStart) || !Number.isInteger(byteEnd) || !Array.isArray(features)) return []
    if (typeof byteStart !== 'number' || typeof byteEnd !== 'number') return []
    if (byteStart < 0 || byteEnd <= byteStart || byteEnd > encodedText.length) return []
    try {
      strictDecoder.decode(encodedText.slice(byteStart, byteEnd))
    } catch {
      return []
    }
    const parsed: Facet = {
      byteStart,
      byteEnd,
    }
    for (const rawFeature of features) {
      const feature = objectValue(rawFeature)
      const featureType = stringValue(feature?.['$type'])
      const rawMentionDid = stringValue(feature?.did)
      if (featureType === 'app.bsky.richtext.facet#link') parsed.href = stringValue(feature?.uri)
      else if (featureType === 'app.bsky.richtext.facet#mention' && rawMentionDid && isDid(rawMentionDid))
        parsed.mentionDid = rawMentionDid
      else if (featureType === 'app.bsky.richtext.facet#tag') parsed.tag = stringValue(feature?.tag)
    }
    return parsed.href || parsed.mentionDid || parsed.tag ? [parsed] : []
  })
}

export function parseImages(value: unknown): FeedImage[] | undefined {
  const embed = objectValue(value)
  if (embed?.['$type'] !== 'app.bsky.embed.images' || !Array.isArray(embed.images)) return undefined
  const images = embed.images.flatMap((rawImage) => {
    const image = objectValue(rawImage)
    const cid = blobCid(image?.image)
    if (!cid) return []
    return [
      {
        cid,
        alt: typeof image?.alt === 'string' ? image.alt : '',
      },
    ]
  })
  return images.length ? images : undefined
}
