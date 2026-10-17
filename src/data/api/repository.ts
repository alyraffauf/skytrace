import { ComAtprotoRepoListRecords } from '@atcute/atproto'
import { ok } from '@atcute/client'
import type { ActorIdentifier, CanonicalResourceUri, Nsid } from '@atcute/lexicons/syntax'
import { isCanonicalResourceUri, isCid } from '@atcute/lexicons/syntax'
import * as v from '@atcute/lexicons/validations'
import type {} from '@atcute/microcosm'
import type { ActorIdentity, Page, RawRecord, RepositoryRecord } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { deadlineSignal } from '../../lib/abort'
import { parseAtUri } from '../../lib/parse'
import { recordCidMatches } from '../../lib/recordCid'
import { hydrationRequests, paginationRequests } from '../../lib/requestScheduler'
import { objectValue, stringValue } from '../recordParsers'
import { PublicDataValidationError } from '../validationError'
import { clientFor } from './client'

const RECORD_COUNT_PAGE_SIZE = 100

// A loose page envelope keeps one malformed PDS record from discarding its peers.
const listRecordsSchema = v.query('com.atproto.repo.listRecords', {
  params: v.object({
    repo: v.actorIdentifierString(),
    collection: v.nsidString(),
    limit: v.optional(v.integer()),
    cursor: v.optional(v.string()),
    reverse: v.optional(v.boolean()),
  }),
  output: {
    type: 'lex',
    schema: v.object({
      records: v.array(v.unknown()),
      cursor: v.optional(v.string()),
    }),
  },
})

function validateRecord(value: unknown, expectedUri?: string): RawRecord {
  const data = objectValue(value)
  const uri = stringValue(data?.uri)
  const cid = stringValue(data?.cid)
  const recordValue = objectValue(data?.value)
  if (
    !uri ||
    !isCanonicalResourceUri(uri) ||
    !cid ||
    !isCid(cid) ||
    !recordValue ||
    (expectedUri && uri !== expectedUri)
  ) {
    throw new PublicDataValidationError('The record service returned malformed data.')
  }
  try {
    if (!recordCidMatches(recordValue, cid)) {
      throw new PublicDataValidationError('The record CID does not match its contents.')
    }
  } catch (error) {
    if (error instanceof PublicDataValidationError) throw error
    throw new PublicDataValidationError('The record contents could not be verified.')
  }
  return { uri, cid, value: recordValue }
}

export async function getRecordByUri(uri: string, signal?: AbortSignal): Promise<RawRecord> {
  if (!parseAtUri(uri)) throw new Error('Cannot fetch an invalid AT URI.')
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.slingshot).get('blue.microcosm.repo.getRecordByUri', {
          params: { at_uri: uri as CanonicalResourceUri },
          signal,
        }),
      ),
    signal,
  )
  return validateRecord(data, uri)
}

export async function listRecords(options: {
  identity: ActorIdentity
  collection: Nsid
  cursor?: string
  limit: number
  signal?: AbortSignal
}): Promise<Page<RepositoryRecord>> {
  const data = await fetchRecordPage(options)
  const items = data.records.map((record, index) => {
    const envelope = v.safeParse(ComAtprotoRepoListRecords.recordSchema, record)
    if (envelope.ok) {
      const parsedUri = parseAtUri(envelope.value.uri)
      if (parsedUri?.did === options.identity.did && parsedUri.collection === options.collection) {
        try {
          return validateRecord(envelope.value)
        } catch {
          return {
            kind: 'unavailable' as const,
            id: envelope.value.uri,
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
