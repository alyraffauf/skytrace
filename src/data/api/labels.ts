import { ComAtprotoLabelDefs, ComAtprotoLabelQueryLabels } from '@atcute/atproto'
import { ok } from '@atcute/client'
import type { Did } from '@atcute/lexicons/syntax'
import { isGenericUri } from '@atcute/lexicons/syntax'
import * as v from '@atcute/lexicons/validations'
import type { LabelEvent, Page, UnavailableItem } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { dedupeBy } from '../../lib/collections'
import { isDid } from '@atcute/lexicons/syntax'
import { paginationRequests } from '../runtime/requestScheduler'
import { objectValue } from '../recordValues'
import { clientFor } from './client'

// Keep the page envelope loose so a single bad label becomes an unavailable row.
const queryLabelsSchema = v.query(ComAtprotoLabelQueryLabels.mainSchema.nsid, {
  params: ComAtprotoLabelQueryLabels.mainSchema.params,
  output: {
    ...ComAtprotoLabelQueryLabels.mainSchema.output,
    schema: v.object({
      ...ComAtprotoLabelQueryLabels.mainSchema.output.schema.shape,
      labels: v.array(v.unknown()),
    }),
  },
})

export async function queryLabels(options: {
  uriPatterns: string[]
  service?: string
  sources?: string[]
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<Page<LabelEvent | UnavailableItem>> {
  const isValidPattern = (pattern: string) =>
    pattern.endsWith('*') ? isGenericUri(pattern.slice(0, -1)) : isGenericUri(pattern)
  if (options.uriPatterns.length === 0 || options.uriPatterns.some((pattern) => !isValidPattern(pattern))) {
    throw new Error('Cannot fetch labels for an invalid subject URI.')
  }
  if (options.sources?.some((source) => !isDid(source)))
    throw new Error('Cannot fetch labels from an invalid source DID.')
  const sources = options.sources as Did[] | undefined
  const matchesSubject = (subject: string) =>
    options.uriPatterns.some((pattern) =>
      pattern.endsWith('*') ? subject.startsWith(pattern.slice(0, -1)) : subject === pattern,
    )
  const data = await paginationRequests.run(
    () =>
      ok(
        clientFor(options.service ?? SERVICE_URLS.labelRelay).call(queryLabelsSchema, {
          params: {
            uriPatterns: options.uriPatterns,
            sources,
            limit: options.limit ?? 50,
            cursor: options.cursor,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
  const pageId = JSON.stringify([
    options.service ?? SERVICE_URLS.labelRelay,
    [...new Set(options.uriPatterns)].sort(),
    [...new Set(options.sources ?? [])].sort(),
    options.cursor ?? null,
    options.limit ?? 50,
  ])
  const items = data.labels.map((rawLabel, index) => {
    // The relay uses the compact JSON string form for bytes. Normalize it to
    // the lexicon JSON representation before applying atcute's label schema.
    const rawObject = objectValue(rawLabel)
    const normalizedLabel =
      typeof rawObject?.sig === 'string' ? { ...rawObject, sig: { $bytes: rawObject.sig } } : rawLabel
    const result = v.safeParse(ComAtprotoLabelDefs.labelSchema, normalizedLabel)
    if (!result.ok || !matchesSubject(result.value.uri)) {
      return { kind: 'unavailable' as const, id: `label:${pageId}:${index}`, reason: 'This label event is malformed.' }
    }
    const label = result.value
    return {
      kind: 'labelEvent' as const,
      id: `${label.src}:${label.uri}:${label.val}:${label.cts}:${label.neg === true ? 'removed' : 'applied'}`,
      sourceDid: label.src,
      subject: label.uri,
      value: label.val,
      createdAt: label.cts,
      expiresAt: label.exp,
      negated: label.neg === true,
    }
  })
  return { items: dedupeBy(items, (item) => item.id), cursor: data.cursor }
}
