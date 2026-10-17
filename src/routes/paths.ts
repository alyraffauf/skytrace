import { parseAtUri } from '../lib/parse'
import type { ProfileTabSlug } from './profileTabs'

export function profilePath(actor: string): string {
  return `/profile/${encodeURIComponent(actor)}`
}

export function profileTabPath(actor: string, tab: ProfileTabSlug): string {
  return `${profilePath(actor)}/${tab}`
}

export function listPath(uri: string): string | undefined {
  const record = parseAtUri(uri)
  if (!record || record.collection !== 'app.bsky.graph.list') return undefined
  return `/list/${encodeURIComponent(record.did)}/${encodeURIComponent(record.rkey)}`
}
