import { ok } from '@atcute/client'
import type {} from '@atcute/bluesky'
import type { ActorSuggestion } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { hydrationRequests } from '../runtime/requestScheduler'
import { clientFor } from './client'

export async function searchActorsTypeahead(query: string, signal?: AbortSignal): Promise<ActorSuggestion[]> {
  const normalizedQuery = query.trim().replace(/^@/, '')
  if (normalizedQuery.length < 2) return []

  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.typeahead).get('app.bsky.actor.searchActorsTypeahead', {
          params: { q: normalizedQuery, limit: 8 },
          signal,
        }),
      ),
    signal,
  )
  return data.actors.map((actor) => ({
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    avatar: actor.avatar,
  }))
}
