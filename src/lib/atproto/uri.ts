import { isCanonicalResourceUri, parseCanonicalResourceUri } from '@atcute/lexicons/syntax'

type AtUriParts = { did: string; collection: string; rkey: string }

export function parseAtUri(value: string): AtUriParts | null {
  if (!isCanonicalResourceUri(value)) return null
  const parsed = parseCanonicalResourceUri(value)
  return { did: parsed.repo, collection: parsed.collection, rkey: parsed.rkey }
}

export function actorFromAtUri(uri: string): string | null {
  return parseAtUri(uri)?.did ?? null
}
