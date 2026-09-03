import { parseAtUri } from './parse'
import type { ProfileTabSlug } from '../profileTabRoutes'

export function profilePath(actor: string): string {
  return `/profile/${actor}`
}

export function profileTabPath(actor: string, tab: ProfileTabSlug): string {
  return `/profile/${actor}/${tab}`
}

export function listPath(uri: string): string | undefined {
  const record = parseAtUri(uri)
  if (!record || record.collection !== 'app.bsky.graph.list') return undefined
  return `/list/${record.did}/${record.rkey}`
}
