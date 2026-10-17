import { describe, expect, it, vi } from 'vitest'
import type { ActorIdentity } from '../src/types'
import { createTestService, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
const memberDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

describe('feed paging', () => {
  it('holds older reposts until newer posts from the next source page are emitted', async () => {
    const targetRequests = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        const method = url.pathname.split('/').at(-1)
        if (method === 'com.atproto.repo.listRecords') {
          const collection = url.searchParams.get('collection')
          const cursor = url.searchParams.get('cursor')
          if (collection === 'app.bsky.feed.post') {
            const month = cursor ? '03' : '04'
            return response({
              records: Array.from({ length: 50 }, (_, index) =>
                repositoryRecord(`at://${did}/app.bsky.feed.post/${month}${String(index).padStart(2, '0')}`, {
                  $type: collection,
                  text: month,
                  createdAt: `2026-${month}-01T00:${String(index).padStart(2, '0')}:00Z`,
                }),
              ),
              ...(cursor ? {} : { cursor: 'posts-2' }),
            })
          }
          return response({
            records: Array.from({ length: 50 }, (_, index) =>
              repositoryRecord(`at://${did}/app.bsky.feed.repost/01${String(index).padStart(2, '0')}`, {
                $type: collection,
                subject: { uri: `at://${memberDid}/app.bsky.feed.post/${index}`, cid },
                createdAt: `2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
              }),
            ),
          })
        }
        if (method === 'blue.microcosm.identity.resolveMiniDoc') {
          const identifier = url.searchParams.get('identifier')
          return identifier === memberDid
            ? response({ did: memberDid, handle: 'member.example', pds: 'https://pds.example', signing_key: 'zQ3test' })
            : response({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
        }
        if (method === 'blue.microcosm.repo.getRecordByUri') {
          targetRequests()
          const uri = url.searchParams.get('at_uri') ?? ''
          return response(
            repositoryRecord(uri, {
              $type: 'app.bsky.feed.post',
              text: 'Reposted target',
              createdAt: '2025-12-01T00:00:00Z',
            }),
          )
        }
        return response({ error: 'UnknownRequest' }, 400)
      }),
    )

    const publicData = createTestService()
    const emitted = []
    let cursor
    do {
      const page = await publicData.feed.feed(identity, cursor)
      emitted.push(...page.items)
      cursor = page.cursor
    } while (emitted.length < 100 && cursor)
    expect(targetRequests).not.toHaveBeenCalled()
    expect(emitted.slice(0, 50).every((item) => item.kind === 'post' && item.createdAt.startsWith('2026-04'))).toBe(
      true,
    )
    expect(emitted.slice(50, 100).every((item) => item.kind === 'post' && item.createdAt.startsWith('2026-03'))).toBe(
      true,
    )
    expect(emitted.slice(100).every((item) => item.kind === 'repost' && !('target' in item))).toBe(true)
    const dates = emitted.map((item) =>
      item.kind === 'unavailable' ? Number.NEGATIVE_INFINITY : Date.parse(item.createdAt),
    )
    expect(dates.every((date, index) => index === 0 || dates[index - 1]! >= date)).toBe(true)
  })

  it('caps empty source advances when a PDS keeps changing cursors', async () => {
    const requestsByCollection = new Map<string, number>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        const collection = url.searchParams.get('collection') ?? ''
        const requests = (requestsByCollection.get(collection) ?? 0) + 1
        requestsByCollection.set(collection, requests)
        return response({ records: [], cursor: `empty-${collection}-${requests}` })
      }),
    )
    const page = await createTestService().feed.feed(identity)
    expect(page.items).toEqual([])
    expect(page.cursor).toBeDefined()
    expect(requestsByCollection).toEqual(
      new Map([
        ['app.bsky.feed.post', 4],
        ['app.bsky.feed.repost', 4],
      ]),
    )
  })

  it('keeps the empty-source cap for the whole emitted feed page', async () => {
    const requestsByCollection = new Map<string, number>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        const collection = url.searchParams.get('collection') ?? ''
        const requests = (requestsByCollection.get(collection) ?? 0) + 1
        requestsByCollection.set(collection, requests)
        if (collection === 'app.bsky.feed.repost') {
          return response({ records: [], cursor: `empty-reposts-${requests}` })
        }
        return response({
          records: Array.from({ length: 12 }, (_, index) =>
            repositoryRecord(`at://${did}/app.bsky.feed.post/post-${index}`, {
              $type: 'app.bsky.feed.post',
              text: `Post ${index}`,
              createdAt: `2026-01-01T00:${String(59 - index).padStart(2, '0')}:00Z`,
            }),
          ),
        })
      }),
    )

    const page = await createTestService().feed.feed(identity)
    expect(page.items).toHaveLength(12)
    expect(requestsByCollection).toEqual(
      new Map([
        ['app.bsky.feed.post', 1],
        ['app.bsky.feed.repost', 4],
      ]),
    )
    expect(page.cursor).toBeDefined()
  })
})
