import { describe, expect, it, vi } from 'vitest'
import { countRecords, listRecords } from '../src/data/api/repository'
import type { ActorIdentity } from '../src/types'
import { createTestService, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

describe('repository api', () => {
  it('paginates PDS records without inventing fake raw records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'pds.example')
          return response({
            records: [
              repositoryRecord(`at://${did}/app.bsky.graph.block/3abc`, {
                $type: 'app.bsky.graph.block',
                createdAt: '2026-01-01T00:00:00Z',
              }),
              { uri: 'not-an-at-uri', value: {} },
            ],
            cursor: 'next',
          })
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const page = await listRecords({ identity, collection: 'app.bsky.graph.block', limit: 25 })
    expect(page.cursor).toBe('next')
    expect(page.items[0]).toMatchObject({ uri: `at://${did}/app.bsky.graph.block/3abc` })
    expect(page.items[1]).toEqual({
      kind: 'unavailable',
      id: 'app.bsky.graph.block:first:1',
      reason: 'This repository record is malformed.',
    })
    const servicePage = await createTestService().blocks.blocking(identity)
    expect(servicePage.items[1]).toMatchObject({ kind: 'unavailable', reason: 'This repository record is malformed.' })
  })

  it('contains a record with a mismatched CID to one unavailable row', async () => {
    const validUri = `at://${did}/app.bsky.graph.block/3valid`
    const tamperedUri = `at://${did}/app.bsky.graph.block/3tampered`
    const validRecord = repositoryRecord(validUri, {
      $type: 'app.bsky.graph.block',
      subject: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
      createdAt: '2026-01-01T00:00:00Z',
    })
    const tamperedRecord = {
      ...repositoryRecord(tamperedUri, {
        $type: 'app.bsky.graph.block',
        subject: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb',
        createdAt: '2026-01-01T00:00:00Z',
      }),
      value: {
        $type: 'app.bsky.graph.block',
        subject: 'did:plc:cccccccccccccccccccccccc',
        createdAt: '2026-01-01T00:00:00Z',
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ records: [validRecord, tamperedRecord] })),
    )

    const page = await listRecords({ identity, collection: 'app.bsky.graph.block', limit: 25 })

    expect(page.items[0]).toMatchObject({ uri: validUri })
    expect(page.items[1]).toEqual({
      kind: 'unavailable',
      id: tamperedUri,
      reason: 'This repository record could not be verified.',
    })
  })

  it('rejects a directly fetched record whose CID does not match its contents', async () => {
    const uri = `at://${did}/app.bsky.feed.post/3tampered`
    const original = repositoryRecord(uri, {
      $type: 'app.bsky.feed.post',
      text: 'Original',
      createdAt: '2026-01-01T00:00:00Z',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ ...original, value: { ...original.value, text: 'Tampered' } })),
    )

    await expect(createTestService().core.record(uri)).rejects.toThrow('record CID does not match its contents')
  })

  it('counts all repository pages', async () => {
    const requestedLimits: string[] = []
    let requests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        requestedLimits.push(url.searchParams.get('limit') ?? '')
        requests += 1
        const cursor = requests < 30 ? `page-${requests}` : undefined
        return response({ records: [{}], cursor })
      }),
    )

    await expect(countRecords({ identity, collection: 'app.bsky.graph.block' })).resolves.toBe(30)
    expect(requests).toBe(30)
    expect(requestedLimits).toEqual(Array.from({ length: 30 }, () => '100'))
  })
})

describe('repository cursor validation', () => {
  it('rejects a repeated repository cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ records: [], cursor: 'same' })),
    )
    await expect(createTestService().blocks.blocking(identity, 'same')).rejects.toThrow('repeated a pagination cursor')
  })
})

it('keeps an invalid record value scoped to its stable record URI', async () => {
  const uri = `at://${did}/app.bsky.graph.block/invalid-value`
  const record = repositoryRecord(uri, { $type: 'app.bsky.graph.block', createdAt: '2026-01-01T00:00:00Z' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response({ records: [{ ...record, value: [] }] })),
  )
  const page = await listRecords({ identity, collection: 'app.bsky.graph.block', limit: 25 })
  expect(page.items).toEqual([
    { kind: 'unavailable', id: uri, reason: 'This repository record could not be verified.' },
  ])
})
