import { AppBskyActorProfile, AppBskyLabelerService } from '@atcute/bluesky'
import { isBlob } from '@atcute/lexicons/interfaces'
import * as v from '@atcute/lexicons/validations'
import type { ActorIdentity, ActorProfile, Facet, FeedImage, LabelValueDefinition, RawRecord } from '../types'
import { isDid } from '../lib/parse'

type RecordValue = Record<string, unknown>

export function objectValue(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function blobCid(value: unknown): ActorProfile['avatarCid'] {
  return isBlob(value) ? value.ref.$link : undefined
}

export function parsedRecord<T>(schema: v.BaseSchema<unknown, T>, record?: RawRecord): T | undefined {
  if (!record) return undefined
  const result = v.safeParse(schema, record.value)
  return result.ok ? result.value : undefined
}

export function profileFromRecord(identity: ActorIdentity, record?: RawRecord): ActorProfile {
  const value = parsedRecord(AppBskyActorProfile.mainSchema, record)
  return {
    kind: 'actorProfile',
    identity,
    displayName: stringValue(value?.displayName),
    description: stringValue(value?.description),
    avatarCid: blobCid(value?.avatar),
  }
}

export function labelDefinitionsFromRecord(record?: RawRecord): LabelValueDefinition[] {
  const value = parsedRecord(AppBskyLabelerService.mainSchema, record)
  return (value?.policies.labelValueDefinitions ?? []).map((definition) => ({
    identifier: definition.identifier,
    locales: definition.locales.map((locale) => ({
      lang: locale.lang,
      name: locale.name,
      description: locale.description,
    })),
  }))
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
