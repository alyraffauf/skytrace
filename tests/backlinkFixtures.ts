import { jsonResponse, repositoryRecord } from './testUtils'

/** A backlink page and its independently fetched relationship records. */
export function relationshipFixture(
  subject: string,
  collection: 'app.bsky.graph.block' | 'app.bsky.graph.listblock',
  count: number,
) {
  const records = Array.from({ length: count }, (_, index) => ({
    did: plcDidForIndex(index),
    collection,
    rkey: 'relationship',
  }))
  const values = new Map(
    records.map((record) => {
      const uri = `at://${record.did}/${collection}/${record.rkey}`
      return [uri, repositoryRecord(uri, { $type: collection, subject, createdAt: '2026-01-01T00:00:00Z' })]
    }),
  )
  return (url: URL): Response | undefined => {
    if (
      url.pathname.endsWith('getBacklinks') &&
      url.searchParams.get('subject') === subject &&
      url.searchParams.get('source') === `${collection}:subject`
    )
      return jsonResponse({ total: count, records })
    const record = values.get(url.searchParams.get('at_uri') ?? '')
    if (url.pathname.endsWith('getRecordByUri') && record) return jsonResponse(record)
    return undefined
  }
}

function plcDidForIndex(index: number): string {
  // PLC identifiers use base32's a-z2-7 alphabet rather than JavaScript's 0-v digits.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  const identifier = index
    .toString(32)
    .split('')
    .map((digit) => alphabet[parseInt(digit, 32)])
    .join('')
    .padStart(24, 'a')
  return `did:plc:${identifier}`
}
