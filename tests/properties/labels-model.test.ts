// @vitest-environment node
import { expect, it } from 'vitest'
import { groupLabelHistory, labelState } from '../../src/lib/labels/history'
import { SubjectLabelsDataService } from '../../src/data/labels/subjectLabelsData'
import { LabelHistoryDataService } from '../../src/data/labels/labelHistoryData'
import type { PublicDataCore } from '../../src/data/publicDataCore'
import type { LabelerDataService } from '../../src/data/labels/labelerData'
import type { LabelPagingState } from '../../src/data/labels/labelPaging'
import type { LabelEvent } from '../../src/types'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
const epoch = Date.UTC(2026, 0, 1)
const date = (tick: number) => new Date(epoch + tick * 1000).toISOString()
const cases = Number(process.env.LABEL_CASES ?? 1000)
const initialSeed = Number(process.env.LABEL_SEED ?? 881731)
let state = initialSeed >>> 0
function random(limit: number) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0
  return Math.floor((state / 0x100000000) * limit)
}
function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const other = random(index + 1)
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}
function event(index: number, key: number, negated: boolean): LabelEvent {
  return {
    kind: 'labelEvent',
    id: `event-${index}`,
    sourceDid,
    subject: `at://${did}/app.bsky.feed.post/${key % 2}`,
    value: `label-${key}`,
    createdAt: date(index),
    expiresAt: index % 3 === 0 ? date(index + 10) : undefined,
    negated,
  }
}

it('matches independently constructed intervals, permutations and expiry boundaries', () => {
  const coverage = { applications: 0, renewals: 0, removals: 0, open: 0, empty: 0, keys: 0 }
  for (let trial = 0; trial < cases; trial++) {
    const input: LabelEvent[] = []
    const expected: Array<LabelEvent & { addedAt?: string }> = []
    let tick = 0
    for (let key = 0; key < random(6); key++) {
      coverage.keys++
      for (let cycle = 0, count = 1 + random(5); cycle < count; cycle++) {
        let application = event(tick++, key, false)
        input.push(application)
        coverage.applications++
        for (let repeat = random(4); repeat > 0; repeat--) {
          application = event(tick++, key, false)
          input.push(application)
          coverage.renewals++
        }
        // An open interval is only possible at the end of this key's history.
        if (cycle === count - 1 && random(2)) {
          expected.push({ ...application, addedAt: application.createdAt })
          coverage.open++
        } else {
          const removal = event(tick++, key, true)
          input.push(removal)
          expected.push({ ...removal, addedAt: application.createdAt, expiresAt: application.expiresAt })
          coverage.removals++
        }
      }
    }
    if (!input.length) coverage.empty++
    expected.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    const permuted = shuffle(input)
    const snapshot = structuredClone(permuted)
    expect(groupLabelHistory(permuted), `seed=${initialSeed} trial=${trial}`).toEqual(expected)
    expect(permuted).toEqual(snapshot)
    for (const label of input) {
      for (const now of [
        epoch - 1,
        Date.parse(label.expiresAt ?? date(0)) - 1,
        Date.parse(label.expiresAt ?? date(0)),
        epoch + 1000000,
      ]) {
        const expired = label.expiresAt !== undefined && now >= Date.parse(label.expiresAt)
        expect(labelState(label, now)).toBe(label.negated ? 'Removed' : expired ? 'Expired' : 'Active')
      }
    }
  }
  console.log('label interval coverage', { seed: initialSeed, cases, ...coverage })
  expect(Math.min(...Object.values(coverage))).toBeGreaterThan(0)
})

it('drains arbitrary page boundaries including duplicate deliveries and rejects cursor cycles', async () => {
  const coverage = { pages: 0, empty: 0, duplicates: 0, cycles: 0 }
  for (let trial = 0; trial < Math.ceil(cases / 4); trial++) {
    const events = Array.from({ length: random(40) }, (_, index) => event(index, random(4), Boolean(random(2))))
    const pages: LabelEvent[][] = [[]]
    for (const label of shuffle(events)) {
      if (random(3) === 0) pages.push([])
      pages.at(-1)!.push(label)
      if (random(3) === 0) {
        pages.at(-1)!.push(label)
        coverage.duplicates++
      }
    }
    pages.push([])
    let requests = 0
    const core = {
      async labelRecords(options: { cursor?: string }) {
        const index = Number(options.cursor ?? 0)
        requests++
        coverage.pages++
        if (!pages[index].length) coverage.empty++
        return { items: pages[index], cursor: index + 1 < pages.length ? String(index + 1) : undefined }
      },
    } as unknown as PublicDataCore
    const actual = await new SubjectLabelsDataService(core).forSubjects([did, did])
    expect(actual.map((label) => label.id).sort()).toEqual(events.map((label) => label.id).sort())
    expect(requests).toBe(pages.length)
    expect(groupLabelHistory(actual)).toEqual(groupLabelHistory(events))
    const cycleLength = 1 + random(8)
    let cycleRequests = 0
    const cyclicCore = {
      async labelRecords() {
        return { items: [], cursor: String(cycleRequests++ % cycleLength) }
      },
    } as unknown as PublicDataCore
    await expect(new SubjectLabelsDataService(cyclicCore).forSubjects([did])).rejects.toThrow(
      'repeated a pagination cursor',
    )
    expect(cycleRequests).toBe(cycleLength + 1)
    coverage.cycles++
  }
  console.log('label pagination coverage', coverage)
})

it('terminates history cursor cycles in each stage without mutating replay snapshots', async () => {
  for (const stage of ['discovery', 'appView', 'provider']) {
    for (let trial = 0; trial < 50; trial++) {
      const cycleLength = 1 + random(8)
      let requests = 0
      const core = {
        async labelRecords() {
          return { items: [], cursor: String(requests++ % cycleLength) }
        },
      } as unknown as PublicDataCore
      const service = new LabelHistoryDataService(core, {} as LabelerDataService)
      let cursor: LabelPagingState | undefined = {
        kind: 'labels',
        did,
        discoveryDone: stage !== 'discovery',
        appViewDone: stage === 'provider',
        providers: stage === 'provider' ? [{ did: sourceDid, service: 'https://labels.example', done: false }] : [],
      }
      for (let step = 0; step < cycleLength + 1; step++) {
        const saved = structuredClone(cursor)
        const page = await service.page(did, cursor)
        expect(cursor).toEqual(saved)
        cursor = page.cursor
      }
      if (stage === 'discovery') expect(cursor?.discoveryDone).toBe(true)
      else expect(cursor).toBeUndefined()
      expect(requests).toBe(cycleLength + (stage === 'discovery' ? 2 : 1))
    }
  }
})

it('matches an array-search oracle for arbitrary repeated removals and timestamp ties', () => {
  const coverage = { ties: 0, unmatchedRemovals: 0, paired: 0 }
  for (let trial = 0; trial < cases; trial++) {
    const input = Array.from({ length: random(60) }, (_, index): LabelEvent => ({
      ...event(index, random(4), Boolean(random(2))),
      sourceDid: random(2) ? sourceDid : did,
      subject: random(2) ? did : `at://${did}/app.bsky.feed.post/shared`,
      createdAt: date(random(12)),
    }))
    const expected: Array<LabelEvent & { addedAt?: string }> = []
    for (const source of [did, sourceDid]) {
      for (const subject of [did, `at://${did}/app.bsky.feed.post/shared`]) {
        for (let key = 0; key < 4; key++) {
          // Describe chronological precedence explicitly, including the documented ID tie break.
          const timeline = input
            .filter(
              (label) => label.subject === subject && label.sourceDid === source && label.value === `label-${key}`,
            )
            .sort(
              (left, right) =>
                Date.parse(left.createdAt) - Date.parse(right.createdAt) || right.id.localeCompare(left.id),
            )
          const used = new Set<LabelEvent>()
          for (let index = 0; index < timeline.length; index++) {
            const removal = timeline[index]
            if (!removal.negated) continue
            const candidates = timeline.slice(0, index).filter((label) => !label.negated && !used.has(label))
            const application = candidates.at(-1)
            if (application) {
              used.add(application)
              expected.push({ ...removal, addedAt: application.createdAt, expiresAt: application.expiresAt })
              coverage.paired++
              if (application.createdAt === removal.createdAt) coverage.ties++
            } else {
              expected.push(removal)
              coverage.unmatchedRemovals++
            }
          }
          const newest = timeline.at(-1)
          if (newest && !newest.negated) expected.push({ ...newest, addedAt: newest.createdAt })
        }
      }
    }
    expected.sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id),
    )
    expect(groupLabelHistory(shuffle(input)), `seed=${initialSeed} arbitrary trial=${trial}`).toEqual(expected)
  }
  console.log('arbitrary label history coverage', coverage)
  expect(Math.min(...Object.values(coverage))).toBeGreaterThan(0)
})
