import { objectValue, stringValue, blobCid, parsedRecord } from './recordValues'
import { AppBskyActorProfile } from '@atcute/bluesky'
import { ComAtprotoLabelDefs } from '@atcute/atproto'
import * as v from '@atcute/lexicons/validations'
import type { ActorIdentity, ActorProfile, Facet, FeedImage, RawRecord } from '../types'
import { isDid } from '@atcute/lexicons/syntax'

const NO_UNAUTHENTICATED_SELF_LABEL = '!no-unauthenticated'

export function profileFromRecord(identity: ActorIdentity, record?: RawRecord): ActorProfile {
  const value = parsedRecord(AppBskyActorProfile.mainSchema, record)
  const labels = v.safeParse(ComAtprotoLabelDefs.selfLabelsSchema, record?.value.labels)
  return {
    kind: 'actorProfile',
    identity,
    hasNoUnauthenticatedSelfLabel:
      labels.ok && labels.value.values.some((label) => label.val === NO_UNAUTHENTICATED_SELF_LABEL),
    displayName: stringValue(value?.displayName),
    pronouns: stringValue(value?.pronouns),
    description: stringValue(value?.description),
    avatarCid: blobCid(value?.avatar),
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
