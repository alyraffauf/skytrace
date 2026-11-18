// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { PublicDataValidationError } from '../../src/data/validationError'
import { hasCursor, type CursorHistory } from '../../src/data/cursorHistory'
import { verifiedBacklinkPublishers } from '../../src/data/graph/verifiedBacklinks'
import { mergeFeedItems } from '../../src/lib/posts/feed'
import type { ActorIdentity, FeedItem, RawRecord, RepositoryRecord } from '../../src/types'
import { createTestService, repositoryRecord } from '../testUtils'
import type { FeedPagingState } from '../../src/data/posts/feedPaging'

// Each case has an independent seed; failures include a complete, JSON-serializable input.
const cases = Number(process.env.PAGING_CASES ?? 300)
function random(seed: number) {
  let state = seed >>> 0
  return (limit: number) => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * limit)
  }
}
const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const other = 'did:plc:xwc5pfr4q6kthctktdb5turw'
const identity: ActorIdentity = {
  kind: 'actorIdentity' as const,
  did,
  handle: 'example.com',
  pds: 'https://pds.example',
}
const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
const rawRecord = (uri: string, value: Record<string, unknown>) => repositoryRecord(uri, value) as RawRecord
const date = (rank: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, rank)).toISOString()

it('matches persistent cursor membership after arbitrary append, fork and query histories', () => {
  const coverage = { append: 0, fork: 0, hit: 0, miss: 0 }
  for (let seed = 1; seed <= cases; seed++) {
    const next = random(seed)
    const snapshots: Array<{ actual?: CursorHistory; expected: string[] }> = [{ expected: [] }]
    let current = snapshots[0]
    for (let step = 0; step < 100; step++) {
      const token = `token-${next(8)}`
      if (next(3) === 0) {
        current = snapshots[next(snapshots.length)]
        coverage.fork++
      } else {
        current = { actual: { cursor: token, previous: current.actual }, expected: [...current.expected, token] }
        snapshots.push(current)
        coverage.append++
      }
      const expected = current.expected.includes(token)
      coverage[expected ? 'hit' : 'miss']++
      expect(hasCursor(current.actual, token), `seed=${seed},step=${step}`).toBe(expected)
    }
  }
  console.info('cursor coverage', coverage)
  for (const count of Object.values(coverage)) expect(count).toBeGreaterThan(0)
})

it('drains independently paginated feed streams completely and replays saved cursors', async () => {
  const coverage = { emptyPages: 0, sourcePages: 0, replay: 0, duplicateMerge: 0, output: 0 }
  for (let seed = 1; seed <= cases; seed++) {
    const next = random(seed)
    const service = createTestService()
    const source: Record<string, RepositoryRecord[][]> = {}
    const expected: Array<{ uri: string; rank: number; type: number }> = []
    for (const [type, collection] of ['app.bsky.feed.post', 'app.bsky.feed.repost'].entries()) {
      const records = Array.from({ length: next(50) }, (_, index) => {
        const rank = 1000 - index * 3 - type
        const uri = `at://${did}/${collection}/${index}`
        expected.push({ uri, rank, type })
        return rawRecord(uri, {
          $type: collection,
          createdAt: date(rank),
          ...(type ? { subject: { uri: `at://${other}/app.bsky.feed.post/target`, cid } } : { text: String(index) }),
        })
      })
      const pages: RepositoryRecord[][] = []
      while (records.length) {
        if (next(4) === 0) {
          pages.push([])
          coverage.emptyPages++
        }
        pages.push(records.splice(0, 1 + next(16)).reverse())
      }
      source[collection] = pages.length ? pages : [[]]
    }
    vi.spyOn(service.core, 'repositoryRecords').mockImplementation(async ({ collection, cursor }) => {
      const index = Number(cursor ?? 0)
      coverage.sourcePages++
      return {
        items: source[collection][index],
        cursor: index + 1 < source[collection].length ? String(index + 1) : undefined,
      }
    })
    const output: FeedItem[] = []
    let cursor: FeedPagingState | undefined
    for (let step = 0; step < 100; step++) {
      const saved = structuredClone(cursor)
      const page = await service.feed.feed(identity, cursor)
      expect(cursor).toEqual(saved)
      if (cursor && next(3) === 0) {
        expect(await service.feed.feed(identity, cursor)).toEqual(page)
        coverage.replay++
      }
      output.push(...page.items)
      cursor = page.cursor
      if (!cursor) break
      if (step === 99) throw new Error(`feed failed to terminate seed=${seed}`)
    }
    expected.sort((left, right) => right.rank - left.rank || left.type - right.type)
    expect(
      output.map((item) => (item.kind === 'unavailable' ? item.id : item.uri)),
      `seed=${seed}`,
    ).toEqual(expected.map(({ uri }) => uri))
    // A separate full-input oracle chooses the first occurrence and sorts its timestamp.
    const overlaps = [...output.slice(0, next(output.length + 1)), ...output, ...output.slice(0, 3)]
    const unique = overlaps.filter(
      (item, index) => overlaps.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index,
    )
    unique.sort(
      (left, right) =>
        Date.parse('createdAt' in right ? right.createdAt : '') - Date.parse('createdAt' in left ? left.createdAt : ''),
    )
    expect(mergeFeedItems(overlaps), `merge seed=${seed}`).toEqual(unique)
    coverage.duplicateMerge += overlaps.length - unique.length
    coverage.output += output.length
    vi.restoreAllMocks()
  }
  console.info('feed coverage', coverage)
  for (const count of Object.values(coverage)) expect(count).toBeGreaterThan(0)
})

it('verifies the complete union of publishers across overlapping graph pages', async () => {
  const coverage = { pages: 0, duplicateReferences: 0, valid: 0, invalid: 0, cycles: 0 }
  for (let seed = 1; seed <= cases; seed++) {
    const next = random(seed)
    const service = createTestService()
    const collection = seed % 2 ? 'app.bsky.graph.block' : 'app.bsky.graph.listblock'
    const subject = collection.endsWith('listblock') ? `at://${did}/app.bsky.graph.list/target` : did
    const catalog = Array.from({ length: 12 }, (_, index) => {
      const publisher = index % 2 ? did : other
      const valid = next(3) === 0
      const rightCollection = next(4) !== 0
      return {
        publisher,
        valid: valid && rightCollection,
        record: rawRecord(`at://${publisher}/${rightCollection ? collection : 'app.bsky.feed.post'}/${index}`, {
          $type: collection,
          subject: valid ? subject : other,
          createdAt: date(index),
        }),
      }
    })
    const pages = Array.from({ length: 2 + next(7) }, () =>
      Array.from({ length: next(12) }, () => next(catalog.length)),
    )
    const cycle = seed % 5 === 0
    const seen: number[] = []
    vi.spyOn(service.core, 'backlinks').mockImplementation(async ({ cursor }) => {
      const index = Number(cursor ?? 0)
      coverage.pages++
      for (const key of pages[index]) {
        if (seen.includes(key)) coverage.duplicateReferences++
        seen.push(key)
        coverage[catalog[key].valid ? 'valid' : 'invalid']++
      }
      return {
        items: pages[index].map((key) => ({ uri: catalog[key].record.uri })),
        cursor:
          index + 1 < pages.length ? String(index + 1) : cycle ? String(Math.max(1, pages.length - 1)) : undefined,
      }
    })
    vi.spyOn(service.core, 'recordForVerification').mockImplementation(
      async (uri) => catalog.find(({ record }) => record.uri === uri)!.record,
    )
    const output: string[] = []
    let failure: unknown
    try {
      for await (const publisher of verifiedBacklinkPublishers(service.core, { subject, collection }))
        output.push(publisher)
    } catch (error) {
      failure = error
    }
    if (cycle) {
      expect(failure, `seed=${seed}`).toBeInstanceOf(PublicDataValidationError)
      coverage.cycles++
    } else expect(failure, `seed=${seed}`).toBeUndefined()
    const wanted = [
      ...new Set(
        pages
          .flat()
          .filter((key) => catalog[key].valid)
          .map((key) => catalog[key].publisher),
      ),
    ].sort()
    expect([...output].sort(), `seed=${seed},pages=${JSON.stringify(pages)}`).toEqual(wanted)
    expect(new Set(output).size).toBe(output.length)
    vi.restoreAllMocks()
  }
  console.info('backlink coverage', coverage)
  for (const count of Object.values(coverage)) expect(count).toBeGreaterThan(0)
})

it('keeps every labeled post while advancing through empty and unlabeled repository pages', async () => {
  const coverage = { empty: 0, unlabeled: 0, labeled: 0, replay: 0, pages: 0 }
  for (let seed = 1; seed <= cases; seed++) {
    const next = random(seed)
    const service = createTestService()
    const labels: import('../../src/types').LabelEvent[] = []
    const expected: string[] = []
    let key = 0
    const pages = Array.from({ length: 1 + next(9) }, () =>
      Array.from({ length: next(13) }, () => {
        const uri = `at://${did}/app.bsky.feed.post/${key++}` as const
        const count = next(4)
        if (count) {
          expected.push(uri)
          coverage.labeled++
        } else coverage.unlabeled++
        for (let index = 0; index < count; index++)
          labels.push({
            kind: 'labelEvent',
            id: `${uri}-${index}`,
            sourceDid: other,
            subject: uri,
            value: 'test',
            negated: false,
            createdAt: date(index),
          })
        return rawRecord(uri, { $type: 'app.bsky.feed.post', text: uri, createdAt: date(key) })
      }),
    )
    vi.spyOn(service.core, 'repositoryRecords').mockImplementation(async ({ cursor }) => {
      const index = Number(cursor ?? 0)
      coverage.pages++
      if (!pages[index].length) coverage.empty++
      return { items: pages[index], cursor: index + 1 < pages.length ? String(index + 1) : undefined }
    })
    vi.spyOn(service.subjectLabels, 'forSubjects').mockImplementation(async (subjects) =>
      labels.filter((label) => subjects.includes(label.subject)),
    )
    let cursor: import('../../src/data/posts/labeledPostsData').LabeledPostsCursor | undefined
    const output: string[] = []
    do {
      const saved = structuredClone(cursor)
      const page = await service.labeledPosts.page(identity, cursor)
      expect(cursor).toEqual(saved)
      if (cursor) {
        expect(await service.labeledPosts.page(identity, cursor)).toEqual(page)
        coverage.replay++
      }
      for (const item of page.items) {
        output.push(item.post.uri)
        expect(item.labels).toEqual(
          labels
            .filter((label) => label.subject === item.post.uri)
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
        )
      }
      cursor = page.cursor
    } while (cursor)
    expect(output, `seed=${seed}`).toEqual(expected)
    vi.restoreAllMocks()
  }
  console.info('labeled coverage', coverage)
  for (const count of Object.values(coverage)) expect(count).toBeGreaterThan(0)
})
