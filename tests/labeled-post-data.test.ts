import { describe, expect, it, vi } from 'vitest'
import type { ActorIdentity } from '../src/types'
import { createTestService, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

describe('labeled post data', () => {
  it('queries each labeled-post subject separately and groups every matching label', async () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const newerUri = `at://${did}/app.bsky.feed.post/3newer`
    const olderUri = `at://${did}/app.bsky.feed.post/3older`
    const labelSubjects: string[] = []
    let repositoryLimit: string | null = null
    let identityRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          repositoryLimit = url.searchParams.get('limit')
          const body = url.searchParams.has('cursor')
            ? { records: [] }
            : {
                records: [
                  repositoryRecord(newerUri, {
                    $type: 'app.bsky.feed.post',
                    text: 'Newer post',
                    createdAt: '2026-04-02T00:00:00Z',
                  }),
                  repositoryRecord(olderUri, {
                    $type: 'app.bsky.feed.post',
                    text: 'Older post',
                    createdAt: '2026-04-01T00:00:00Z',
                  }),
                ],
                cursor: 'older-posts',
              }
          return response(body)
        }
        if (url.hostname === 'labelers.firehose.stream') {
          const subjects = url.searchParams.getAll('uriPatterns')
          expect(subjects).toHaveLength(1)
          const subject = subjects[0]!
          labelSubjects.push(subject)
          const labels =
            subject === newerUri
              ? [
                  { ver: 1, src: sourceDid, uri: newerUri, val: 'first-label', cts: '2026-04-03T00:00:00Z' },
                  { ver: 1, src: sourceDid, uri: newerUri, val: 'second-label', cts: '2026-04-04T00:00:00Z' },
                ]
              : [{ ver: 1, src: sourceDid, uri: olderUri, val: 'older-label', cts: '2026-04-05T00:00:00Z' }]
          return response({ labels })
        }
        if (url.pathname.endsWith('resolveMiniDoc')) {
          identityRequests += 1
          return response({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const service = createTestService()
    const page = await service.labeledPosts.page(identity)
    expect(repositoryLimit).toBe('12')
    expect(labelSubjects).toEqual(expect.arrayContaining([newerUri, olderUri]))
    expect(labelSubjects).toHaveLength(2)
    expect(page.cursor).toBeDefined()
    expect(page.items.map((item) => item.post.uri)).toEqual([newerUri, olderUri])
    expect(page.items[0]?.labels.map((label) => label.value)).toEqual(['second-label', 'first-label'])
    expect(page.items[0]?.labels[0]?.sourceDid).toBe(sourceDid)
    expect(page.items[0]?.post).toMatchObject({ kind: 'post', author: { kind: 'actorReference', did } })
    expect(identityRequests).toBe(0)
  })

  it('continues labeled-post discovery after a page without matching labels', async () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const unlabeledUri = `at://${did}/app.bsky.feed.post/3unlabeled`
    const labeledUri = `at://${did}/app.bsky.feed.post/3labeled`
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          if (!url.searchParams.has('cursor')) {
            return response({
              records: [
                repositoryRecord(unlabeledUri, {
                  $type: 'app.bsky.feed.post',
                  text: 'No labels here',
                  createdAt: '2026-09-02T00:00:00Z',
                }),
              ],
              cursor: 'older-posts',
            })
          }
          return response({
            records: [
              repositoryRecord(labeledUri, {
                $type: 'app.bsky.feed.post',
                text: 'Found later',
                createdAt: '2026-09-01T00:00:00Z',
              }),
            ],
          })
        }
        if (url.hostname === 'labelers.firehose.stream') {
          const subject = url.searchParams.get('uriPatterns')
          return response({
            labels:
              subject === labeledUri
                ? [
                    {
                      ver: 1,
                      src: sourceDid,
                      uri: labeledUri,
                      val: 'graphic-media',
                      cts: '2026-09-02T12:00:00Z',
                    },
                  ]
                : [],
          })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const service = createTestService()
    const firstPage = await service.labeledPosts.page(identity)
    expect(firstPage.items).toEqual([])
    expect(firstPage.cursor).toBeDefined()

    const secondPage = await service.labeledPosts.page(identity, firstPage.cursor)
    expect(secondPage.items).toMatchObject([
      {
        post: { kind: 'post', uri: labeledUri, text: 'Found later' },
        labels: [{ value: 'graphic-media' }],
      },
    ])
    expect(secondPage.cursor).toBeUndefined()
  })

  it('omits malformed labeled posts without dropping the next repository page', async () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const malformedUri = `at://${did}/app.bsky.feed.post/3malformed`
    const validUri = `at://${did}/app.bsky.feed.post/3valid`
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          return url.searchParams.has('cursor')
            ? response({
                records: [
                  repositoryRecord(validUri, {
                    $type: 'app.bsky.feed.post',
                    text: 'Still reachable',
                    createdAt: '2026-08-01T00:00:00Z',
                  }),
                ],
              })
            : response({
                records: [repositoryRecord(malformedUri, { $type: 'app.bsky.feed.post', text: 42 })],
                cursor: 'older-posts',
              })
        }
        if (url.hostname === 'labelers.firehose.stream') {
          const subject = url.searchParams.get('uriPatterns')!
          return response({
            labels: [{ ver: 1, src: sourceDid, uri: subject, val: 'test-label', cts: '2026-08-02T00:00:00Z' }],
          })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const publicData = createTestService()
    const malformedPage = await publicData.labeledPosts.page(identity)
    expect(malformedPage.items).toEqual([])
    expect(malformedPage.cursor).toBeDefined()

    const validPage = await publicData.labeledPosts.page(identity, malformedPage.cursor)
    expect(validPage.items).toMatchObject([{ post: { uri: validUri, text: 'Still reachable' } }])
  })

  it('emits only valid posts from a mixed labeled-post page', async () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    const validUri = `at://${did}/app.bsky.feed.post/3valid`
    const malformedUri = `at://${did}/app.bsky.feed.post/3malformed`
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          return response({
            records: [
              repositoryRecord(validUri, {
                $type: 'app.bsky.feed.post',
                text: 'Visible',
                createdAt: '2026-08-01T00:00:00Z',
              }),
              repositoryRecord(malformedUri, { $type: 'app.bsky.feed.post' }),
            ],
          })
        }
        if (url.hostname === 'labelers.firehose.stream') {
          const subject = url.searchParams.get('uriPatterns')!
          return response({
            labels: [{ ver: 1, src: sourceDid, uri: subject, val: 'test-label', cts: '2026-08-02T00:00:00Z' }],
          })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const page = await createTestService().labeledPosts.page(identity)
    expect(page.items.map((item) => item.post.uri)).toEqual([validUri])
  })
})
