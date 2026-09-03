import { parseAtUri } from './parse'

export const socialAppOrigins = {
  bluesky: 'https://bsky.app',
  blacksky: 'https://blacksky.community',
  witchsky: 'https://witchsky.app',
  mu: 'https://mu.social',
} as const

export function pdslsRecordUrl(uri: string): string | undefined {
  return parseAtUri(uri) ? `https://pdsls.dev/${uri}` : undefined
}

export function socialProfilePath(actor: string): string {
  return `/profile/${actor}`
}

export function socialPostPath(actor: string, rkey: string): string {
  return `${socialProfilePath(actor)}/post/${rkey}`
}

export function socialListPath(actor: string, rkey: string): string {
  return `${socialProfilePath(actor)}/lists/${rkey}`
}

export function socialPathForAtUri(uri: string): string | undefined {
  const record = parseAtUri(uri)
  if (!record) return undefined
  if (record.collection === 'app.bsky.feed.post') {
    return socialPostPath(record.did, record.rkey)
  }
  if (record.collection === 'app.bsky.graph.list') {
    return socialListPath(record.did, record.rkey)
  }
  return undefined
}
