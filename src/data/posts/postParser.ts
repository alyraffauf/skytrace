import { AppBskyFeedPost } from '@atcute/bluesky'
import { isCanonicalResourceUri } from '@atcute/lexicons/syntax'
import type { Facet, FeedPost, RawRecord, UnavailableItem } from '../../types'
import { tryParseRecordUri } from '../../lib/atproto/uri'
import { actorReference, unavailable } from '../recordResults'
import { parsedRecord, stringValue } from '../recordValues'

export function decodePostRecord(record: RawRecord): Omit<FeedPost, 'repositoryPds'> | UnavailableItem {
  const uri = tryParseRecordUri(record.uri)
  const value = parsedRecord(AppBskyFeedPost.mainSchema, record)
  if (!uri || !value) return unavailable(record.uri, 'This post is malformed or unavailable.')
  const embed = value.embed
  const mediaEmbed = embed?.$type === 'app.bsky.embed.recordWithMedia' ? embed.media : embed
  const quoteUri =
    embed?.$type === 'app.bsky.embed.recordWithMedia'
      ? embed.record.record.uri
      : embed?.$type === 'app.bsky.embed.record'
        ? embed.record.uri
        : undefined
  const replyTo = value.reply?.parent.uri
  const images =
    mediaEmbed?.$type === 'app.bsky.embed.images' && mediaEmbed.images.length > 0
      ? mediaEmbed.images.map(({ image, alt }) => ({ cid: image.ref.$link, alt }))
      : undefined
  const video =
    mediaEmbed?.$type === 'app.bsky.embed.video'
      ? {
          cid: mediaEmbed.video.ref.$link,
          alt: stringValue(mediaEmbed.alt),
          mimeType: stringValue(mediaEmbed.video.mimeType),
        }
      : undefined
  return {
    kind: 'post',
    uri: record.uri,
    author: actorReference(uri.repo),
    createdAt: value.createdAt,
    text: value.text,
    facets: parseFacets(value.text, value.facets),
    replyTo: isCanonicalResourceUri(replyTo) ? replyTo : undefined,
    quoteUri: isCanonicalResourceUri(quoteUri) ? quoteUri : undefined,
    images,
    video,
  }
}

export function parseFacets(text: string, facets: AppBskyFeedPost.Main['facets']): Facet[] {
  if (!facets) return []
  const encodedText = new TextEncoder().encode(text)
  const strictDecoder = new TextDecoder('utf-8', { fatal: true })
  return facets.flatMap((facet) => {
    const { byteStart, byteEnd } = facet.index
    if (byteStart < 0 || byteEnd <= byteStart || byteEnd > encodedText.length) return []
    try {
      strictDecoder.decode(encodedText.slice(byteStart, byteEnd))
    } catch {
      return []
    }
    const parsed: Facet = { byteStart, byteEnd }
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#link') parsed.href = feature.uri
      else if (feature.$type === 'app.bsky.richtext.facet#mention') parsed.mentionDid = feature.did
      else if (feature.$type === 'app.bsky.richtext.facet#tag') parsed.tag = stringValue(feature.tag)
    }
    return parsed.href || parsed.mentionDid || parsed.tag ? [parsed] : []
  })
}
