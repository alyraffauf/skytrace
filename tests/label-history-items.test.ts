import { expect, it, vi } from 'vitest'
import type { LabelPagingState } from '../src/data/labels/labelPaging'
import type { LabelEvent, UnavailableItem } from '../src/types'
import { createTestService } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const sourceDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'

it.each(['AppView', 'provider'])('keeps sorted labels and unavailable rows on a mixed %s page', async (service) => {
  const label = (id: string, createdAt: string): LabelEvent => ({
    kind: 'labelEvent',
    id,
    sourceDid,
    subject: did,
    value: id,
    createdAt,
    negated: false,
  })
  const unavailable: UnavailableItem = { kind: 'unavailable', id: 'unavailable', reason: 'Malformed label' }
  const newer = label('newer-first', '2026-02-01T00:00:00Z')
  const items = [
    unavailable,
    label('older', '2026-01-01T00:00:00Z'),
    newer,
    label('newer-second', newer.createdAt),
    newer,
    unavailable,
  ]
  const cursor: LabelPagingState = {
    kind: 'labels',
    did,
    discoveryDone: true,
    appViewDone: service === 'provider',
    seenAppViewCursors: [],
    providers: [{ did: sourceDid, service: 'https://labels.example', done: false }],
  }
  const publicData = createTestService()
  vi.spyOn(publicData.core, 'labelRecords').mockResolvedValue({ items })

  const page = await publicData.labelHistory.page(did, cursor)

  expect(page.items.map((item) => item.id)).toEqual([
    'newer-first',
    'newer-second',
    'older',
    'unavailable',
    'unavailable',
  ])
  expect(page.items[0]).toMatchObject({ sourceDid })
  expect(page.items.at(-1)).toBe(unavailable)
  expect(cursor.providers[0]?.done).toBe(false)
  expect(items[0]).toBe(unavailable)
})
