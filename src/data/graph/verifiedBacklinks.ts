import { AppBskyGraphBlock, AppBskyGraphListblock } from '@atcute/bluesky'
import { ClientResponseError } from '@atcute/client'
import { throwIfAborted } from '../../lib/abort'
import { tryParseRecordUri } from '../../lib/atproto/uri'
import type { PublicDataCore } from '../publicDataCore'
import { parsedRecord } from '../recordValues'
import { runCancellableScan } from '../runtime/scanCancellation'
import { PublicDataValidationError } from '../validationError'

type BacklinkRelationship = {
  subject: string
  collection: 'app.bsky.graph.block' | 'app.bsky.graph.listblock'
  did?: string
}

/** Yields distinct publishers whose records establish the requested relationship, rather than trusting index claims. */
export async function* verifiedBacklinkPublishers(
  core: PublicDataCore,
  relationship: BacklinkRelationship,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const seenCursors = new Set<string>()
  const seenRecords = new Set<string>()
  const publishers = new Set<string>()
  let cursor: string | undefined
  do {
    throwIfAborted(signal)
    const page = await core.backlinks({
      subject: relationship.subject,
      source: `${relationship.collection}:subject`,
      did: relationship.did,
      cursor,
      signal,
    })
    const candidates = page.items.filter(({ uri }) => {
      if (seenRecords.has(uri)) return false
      seenRecords.add(uri)
      const publisher = tryParseRecordUri(uri)?.repo
      return publisher !== undefined && !publishers.has(publisher)
    })
    // The existing hydration scheduler bounds concurrency. Stop only this page's consumers on failure.
    const pagePublishers = await runCancellableScan(signal, ({ signal: pageSignal, stop }) =>
      Promise.all(
        candidates.map(({ uri }) =>
          verifyBacklinkPublisher(core, { ...relationship, uri, signal: pageSignal }).catch((error: unknown) => {
            stop(error)
            throw error
          }),
        ),
      ),
    )
    for (const publisher of pagePublishers) {
      if (publisher && !publishers.has(publisher)) {
        publishers.add(publisher)
        yield publisher
      }
    }
    cursor = page.cursor
    if (cursor && seenCursors.has(cursor))
      throw new PublicDataValidationError('Constellation repeated a pagination cursor.')
    if (cursor) seenCursors.add(cursor)
  } while (cursor)
}

async function verifyBacklinkPublisher(
  core: PublicDataCore,
  { uri, signal, ...relationship }: BacklinkRelationship & { uri: string; signal: AbortSignal },
): Promise<string | undefined> {
  const parts = tryParseRecordUri(uri)
  if (!parts || parts.collection !== relationship.collection || (relationship.did && parts.repo !== relationship.did))
    return undefined
  try {
    const record = await core.recordForVerification(uri, signal)
    const value =
      relationship.collection === 'app.bsky.graph.block'
        ? parsedRecord(AppBskyGraphBlock.mainSchema, record)
        : parsedRecord(AppBskyGraphListblock.mainSchema, record)
    return value?.subject === relationship.subject ? parts.repo : undefined
  } catch (error) {
    throwIfAborted(signal)
    // Confirmed absence is different from an unverifiable service response: integrity faults must propagate.
    if (error instanceof ClientResponseError && (error.status === 404 || error.error === 'RecordNotFound'))
      return undefined
    throw error
  }
}

export async function countVerifiedBacklinkPublishers(
  core: PublicDataCore,
  relationship: BacklinkRelationship,
  signal?: AbortSignal,
): Promise<number> {
  let count = 0
  for await (const _publisher of verifiedBacklinkPublishers(core, relationship, signal)) count++
  return count
}
