import { isCanonicalResourceUri } from '@atcute/lexicons/syntax'
import { tryParseRecordUri } from './atproto/uri'

export function pdslsRecordUrl(uri: string): string | undefined {
  return isCanonicalResourceUri(uri) ? `https://pdsls.dev/${uri}` : undefined
}

export function skythreadPostUrl(uri: string): string | undefined {
  const record = tryParseRecordUri(uri)
  if (record?.collection !== 'app.bsky.feed.post') return undefined

  const url = new URL('https://skythread.mackuba.eu/')
  url.searchParams.set('author', record.repo)
  url.searchParams.set('post', record.rkey)
  return url.toString()
}

export function socialProfilePath(actor: string): string {
  return `/profile/${encodeSocialPathSegment(actor)}`
}

export function socialPostPath(actor: string, rkey: string): string {
  return `${socialProfilePath(actor)}/post/${encodeSocialPathSegment(rkey)}`
}

export function socialListPath(actor: string, rkey: string): string {
  return `${socialProfilePath(actor)}/lists/${encodeSocialPathSegment(rkey)}`
}

function encodeSocialPathSegment(value: string): string {
  // Social clients expect literal colons in DID path segments.
  return encodeURIComponent(value).replaceAll('%3A', ':')
}

export function socialPathForAtUri(uri: string): string | undefined {
  const record = tryParseRecordUri(uri)
  if (!record) return undefined
  if (record.collection === 'app.bsky.feed.post') {
    return socialPostPath(record.repo, record.rkey)
  }
  if (record.collection === 'app.bsky.graph.list') {
    return socialListPath(record.repo, record.rkey)
  }
  return undefined
}
