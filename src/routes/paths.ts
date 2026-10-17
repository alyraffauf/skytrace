import { tryParseRecordUri } from '../lib/atproto/uri'
import type { ProfileTabSlug } from './profileTabs'

export function profilePath(actor: string): string {
  return `/profile/${encodeURIComponent(actor)}`
}

export function profileTabPath(actor: string, tab: ProfileTabSlug): string {
  return `${profilePath(actor)}/${tab}`
}

export function listPath(uri: string): string | undefined {
  const record = tryParseRecordUri(uri)
  if (!record || record.collection !== 'app.bsky.graph.list') return undefined
  return `/list/${encodeURIComponent(record.repo)}/${encodeURIComponent(record.rkey)}`
}
