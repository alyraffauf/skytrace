import { ComAtprotoRepoListRecords } from '@atcute/atproto'
import { ok } from '@atcute/client'
import type { ActorIdentifier, Nsid } from '@atcute/lexicons/syntax'
import { isCanonicalResourceUri } from '@atcute/lexicons/syntax'
import * as v from '@atcute/lexicons/validations'
import type {} from '@atcute/microcosm'
import type { ActorIdentity, Page, RawRecord, RepositoryRecord } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { deadlineSignal } from '../../lib/abort'
import { parseAtUri } from '../../lib/atproto/uri'
import { recordValueCid } from '../../lib/atproto/recordCid'
import { hydrationRequests, paginationRequests } from '../runtime/requestScheduler'
import { objectValue } from '../recordValues'
import { PublicDataValidationError } from '../validationError'
import { clientFor } from './client'

const RECORD_COUNT_PAGE_SIZE = 100

// A loose page envelope keeps one malformed PDS record from discarding its peers.
const listRecordsSchema = v.query(ComAtprotoRepoListRecords.mainSchema.nsid, {
  params: ComAtprotoRepoListRecords.mainSchema.params,
  output: {
    ...ComAtprotoRepoListRecords.mainSchema.output,
    schema: v.object({
      ...ComAtprotoRepoListRecords.mainSchema.output.schema.shape,
      records: v.array(v.unknown()),
    }),
  },
})

function verifyRecord(record: ComAtprotoRepoListRecords.Record): RawRecord {
  const value = objectValue(record.value)
  if (!isCanonicalResourceUri(record.uri) || !value)
    throw new PublicDataValidationError('The record service returned malformed data.')
  try {
    if (recordValueCid(value) !== record.cid) {
      throw new PublicDataValidationError('The record CID does not match its contents.')
    }
  } catch (error) {
    if (error instanceof PublicDataValidationError) throw error
    throw new PublicDataValidationError('The record contents could not be verified.')
  }
  return { uri: record.uri, cid: record.cid, value }
}

export async function getRecordByUri(uri: string, signal?: AbortSignal): Promise<RawRecord> {
  if (!isCanonicalResourceUri(uri)) throw new Error('Cannot fetch an invalid AT URI.')
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.slingshot).get('blue.microcosm.repo.getRecordByUri', {
          params: { at_uri: uri },
          signal,
        }),
      ),
    signal,
  )
  const envelope = v.safeParse(ComAtprotoRepoListRecords.recordSchema, data)
  if (!envelope.ok || envelope.value.uri !== uri)
    throw new PublicDataValidationError('The record service returned malformed data.')
  return verifyRecord(envelope.value)
}

export async function listRecords(options: {
  identity: ActorIdentity
  collection: Nsid
  cursor?: string
  limit: number
  signal?: AbortSignal
}): Promise<Page<RepositoryRecord>> {
  const data = await fetchRecordPage(options)
  const items = data.records.map((value, index) => {
    const envelope = v.safeParse(ComAtprotoRepoListRecords.recordSchema, value)
    if (envelope.ok) {
      const record = envelope.value
      const parsedUri = parseAtUri(record.uri)
      if (parsedUri?.did === options.identity.did && parsedUri.collection === options.collection) {
        try {
          return verifyRecord(record)
        } catch {
          return {
            kind: 'unavailable' as const,
            id: record.uri,
            reason: 'This repository record could not be verified.',
          }
        }
      }
    }
    const pageId = options.cursor ?? 'first'
    return {
      kind: 'unavailable' as const,
      id: `${options.collection}:${pageId}:${index}`,
      reason: 'This repository record is malformed.',
    }
  })
  return { items, cursor: data.cursor }
}

export async function countRecords(options: {
  identity: ActorIdentity
  collection: Nsid
  signal?: AbortSignal
  requestTimeoutMs?: number
}): Promise<number> {
  let total = 0
  let cursor: string | undefined
  const seenCursors = new Set<string>()

  while (true) {
    const signal = options.requestTimeoutMs ? deadlineSignal(options.signal, options.requestTimeoutMs) : options.signal
    const page = await fetchRecordPage({ ...options, cursor, limit: RECORD_COUNT_PAGE_SIZE, signal })
    total += page.records.length
    if (!page.cursor) return total
    if (seenCursors.has(page.cursor)) throw new PublicDataValidationError('The PDS repeated a pagination cursor.')
    seenCursors.add(page.cursor)
    cursor = page.cursor
  }
}

function fetchRecordPage(options: {
  identity: ActorIdentity
  collection: Nsid
  cursor?: string
  limit: number
  signal?: AbortSignal
}) {
  return paginationRequests.run(
    () =>
      ok(
        clientFor(options.identity.pds).call(listRecordsSchema, {
          params: {
            repo: options.identity.did as ActorIdentifier,
            collection: options.collection,
            limit: options.limit,
            reverse: false,
            cursor: options.cursor,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
}
