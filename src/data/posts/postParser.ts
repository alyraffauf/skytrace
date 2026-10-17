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
  let quoteUri: string | undefined
  if (embed?.$type === 'app.bsky.embed.recordWithMedia') {
    quoteUri = embed.record.record.uri
  } else if (embed?.$type === 'app.bsky.embed.record') {
    quoteUri = embed.record.uri
  }
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
          captions: mediaEmbed.captions?.map(({ file, lang }) => ({ cid: file.ref.$link, lang })),
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
  const normalized: Facet[] = []
  let position = 0
  for (const facet of [...facets].sort((left, right) => left.index.byteStart - right.index.byteStart)) {
    const { byteStart, byteEnd } = facet.index
    if (byteStart < position || byteEnd <= byteStart || byteEnd > encodedText.length) continue
    try {
      strictDecoder.decode(encodedText.subarray(byteStart, byteEnd))
    } catch {
      continue
    }
    const features = facet.features.filter(
      (feature) =>
        feature.$type === 'app.bsky.richtext.facet#link' ||
        feature.$type === 'app.bsky.richtext.facet#mention' ||
        (feature.$type === 'app.bsky.richtext.facet#tag' && stringValue(feature.tag)),
    )
    if (features.length === 0) continue
    normalized.push({ ...facet, features })
    position = byteEnd
  }
  return normalized
}
