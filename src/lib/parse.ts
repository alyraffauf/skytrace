import {
  isCanonicalResourceUri,
  isDid as isAtcuteDid,
  isHandle,
  parseCanonicalResourceUri,
} from '@atcute/lexicons/syntax'
import type { Did } from '@atcute/lexicons/syntax'

type AtUriParts = { did: string; collection: string; rkey: string }

export function isDid(value: string): value is Did {
  return isAtcuteDid(value)
}

export function parseAtUri(value: string): AtUriParts | null {
  if (!isCanonicalResourceUri(value)) return null
  const parsed = parseCanonicalResourceUri(value)
  return { did: parsed.repo, collection: parsed.collection, rkey: parsed.rkey }
}

export function normalizeActorInput(input: string): string {
  let value = input.trim()
  if (!value) throw new Error('Enter a handle, DID, or profile URL.')

  if (/^https?:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error('That profile URL is not valid.')
    }
    if (!['bsky.app', 'www.bsky.app'].includes(url.hostname.toLowerCase())) {
      throw new Error('Use a bsky.app profile URL.')
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'profile' || !parts[1]) throw new Error('That URL does not point to a profile.')
    value = decodeURIComponent(parts[1])
  }

  value = value.replace(/^@/, '').trim()
  if (isDid(value)) return value
  const handle = value.toLowerCase().replace(/\.$/, '')
  if (!isHandle(handle)) throw new Error('Enter a valid handle or DID.')
  return handle
}

export function actorFromAtUri(uri: string): string | null {
  return parseAtUri(uri)?.did ?? null
}

export function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
