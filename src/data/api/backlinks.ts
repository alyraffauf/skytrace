import { ok } from '@atcute/client'
import type { Did, GenericUri } from '@atcute/lexicons/syntax'
import { isGenericUri } from '@atcute/lexicons/syntax'
import * as v from '@atcute/lexicons/validations'
import type {} from '@atcute/microcosm'
import type { Page } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { dedupeBy } from '../../lib/collections'
import { isDid } from '../../lib/parse'
import { hydrationRequests, paginationRequests } from '../../lib/requestScheduler'
import { clientFor } from './client'

const backlinkSources = [
  'app.bsky.graph.block:subject',
  'app.bsky.graph.listblock:subject',
  'app.bsky.graph.listitem:list',
  'app.bsky.graph.listitem:subject',
] as const
type BacklinkSource = (typeof backlinkSources)[number]

const backlinksSchema = v.query('blue.microcosm.links.getBacklinks', {
  params: v.object({
    did: v.optional(v.array(v.didString())),
    subject: v.genericUriString(),
    source: v.string(),
    limit: v.optional(v.integer()),
    cursor: v.optional(v.string()),
    reverse: v.optional(v.boolean()),
  }),
  output: {
    type: 'lex',
    schema: v.object({
      total: v.integer(),
      records: v.array(v.object({ did: v.didString(), collection: v.nsidString(), rkey: v.recordKeyString() })),
      cursor: v.optional(v.nullable(v.string())),
    }),
  },
})

export async function getBacklinks(options: {
  subject: string
  source: BacklinkSource
  did?: string
  limit?: number
  cursor?: string
  signal?: AbortSignal
}): Promise<Page<{ uri: string }>> {
  if (!isGenericUri(options.subject)) throw new Error('Cannot fetch backlinks for an invalid subject URI.')
  if (!backlinkSources.includes(options.source)) throw new Error('Cannot fetch backlinks for an unsupported source.')
  if (options.did && !isDid(options.did)) throw new Error('Cannot filter backlinks for an invalid DID.')
  const data = await paginationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.constellation).call(backlinksSchema, {
          params: {
            did: options.did ? [options.did as Did] : undefined,
            subject: options.subject as GenericUri,
            source: options.source,
            limit: options.did ? 1 : (options.limit ?? 100),
            reverse: false,
            cursor: options.cursor,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
  const items = data.records.map((record) => ({ uri: `at://${record.did}/${record.collection}/${record.rkey}` }))
  return { items: dedupeBy(items, (item) => item.uri), cursor: data.cursor ?? undefined }
}

export async function getBacklinksCount(options: {
  subject: string
  source: BacklinkSource
  signal?: AbortSignal
}): Promise<number> {
  if (!isGenericUri(options.subject)) throw new Error('Cannot count backlinks for an invalid subject URI.')
  if (!backlinkSources.includes(options.source)) throw new Error('Cannot count backlinks from an unsupported source.')
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.constellation).get('blue.microcosm.links.getBacklinksCount', {
          params: {
            subject: options.subject as GenericUri,
            source: options.source,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
  return data.total
}
