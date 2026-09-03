import { ClientResponseError } from '@atcute/client'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import { getBacklinks, listRecords, queryLabels, validateIdentity } from '../src/data/xrpc'
import { CACHE_TTL_MS } from '../src/lib/cache'
import { retryDelay, shouldRetry } from '../src/lib/http'
import type { ActorIdentity } from '../src/types'
import { createTestService } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

describe('atcute-backed API boundaries', () => {
  it('paginates PDS records without inventing fake raw records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'pds.example')
          return new Response(
            JSON.stringify({
              records: [
                {
                  uri: `at://${did}/app.bsky.graph.block/3abc`,
                  cid,
                  value: { $type: 'app.bsky.graph.block', createdAt: '2026-01-01T00:00:00Z' },
                },
                { uri: 'not-an-at-uri', value: {} },
              ],
              cursor: 'next',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const page = await listRecords({ identity, collection: 'app.bsky.graph.block', limit: 25 })
    expect(page.cursor).toBe('next')
    expect(page.items[0]).toMatchObject({ uri: `at://${did}/app.bsky.graph.block/3abc`, cid })
    expect(page.items[1]).toEqual({
      kind: 'unavailable',
      id: 'app.bsky.graph.block:first:1',
      reason: 'This repository record is malformed.',
    })
    const servicePage = await createTestService().blocking(identity)
    expect(servicePage.items[1]).toMatchObject({ kind: 'unavailable', reason: 'This repository record is malformed.' })
  })

  it('paginates labels and contains malformed events to one unavailable row', async () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    let requestedUrl: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input instanceof Request ? input.url : String(input))
        return new Response(
          JSON.stringify({
            cursor: 'next-label',
            labels: [
              {
                ver: 1,
                src: sourceDid,
                uri: did,
                val: '!suspend',
                neg: true,
                cts: '2026-02-01T21:02:00.515Z',
                sig: 'c2lnbmF0dXJl',
              },
              { src: 'not-a-did', uri: did },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )

    const page = await queryLabels({ uriPatterns: [did], sources: [sourceDid], cursor: 'first-label' })
    expect(requestedUrl?.hostname).toBe('labelers.firehose.stream')
    expect(requestedUrl?.searchParams.get('uriPatterns')).toBe(did)
    expect(requestedUrl?.searchParams.get('sources')).toBe(sourceDid)
    expect(requestedUrl?.searchParams.get('cursor')).toBe('first-label')
    expect(page.cursor).toBe('next-label')
    expect(page.items[0]).toMatchObject({
      kind: 'labelEvent',
      sourceDid,
      subject: did,
      value: '!suspend',
      negated: true,
    })
    expect(page.items[1]).toEqual({
      kind: 'unavailable',
      id: 'label:first-label:1',
      reason: 'This label event is malformed.',
    })
  })

  it('keeps handle.invalid identities and rejects unsafe PDS addresses', () => {
    expect(validateIdentity({ did, handle: 'handle.invalid', pds: 'https://pds.example' }).handle).toBe(
      'handle.invalid',
    )
    expect(validateIdentity({ did, handle: 'atproto.com', pds: 'http://localhost:3000' }).pds).toBe(
      'http://localhost:3000',
    )
    expect(() => validateIdentity({ did, handle: 'atproto.com', pds: 'http://pds.example' })).toThrow('unsafe PDS')
    expect(() => validateIdentity({ did, handle: 'atproto.com', pds: 'ftp://localhost' })).toThrow('unsafe PDS')
  })

  it('returns an identity-only profile when the profile record was deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('resolveMiniDoc'))
          return new Response(
            JSON.stringify({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        return new Response(JSON.stringify({ error: 'NotFound', message: 'Deleted' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const service = createTestService()
    await expect(service.profile('atproto.com')).resolves.toEqual({ kind: 'actorProfile', identity })
  })

  it('returns an identity-only profile for a malformed profile envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('resolveMiniDoc'))
          return new Response(
            JSON.stringify({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        return new Response(JSON.stringify({ uri: 'not-an-at-uri', value: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const service = createTestService()
    await expect(service.profile('atproto.com')).resolves.toEqual({ kind: 'actorProfile', identity })
  })

  it('surfaces transient failures while loading the primary profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('resolveMiniDoc'))
          return new Response(
            JSON.stringify({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        return new Response(JSON.stringify({ error: 'UpstreamFailure', message: 'Try later' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const service = createTestService()
    await expect(service.profile('atproto.com')).rejects.toMatchObject({ status: 503 })
  })

  it('reuses identity and record reads until their TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const recordUri = `at://${did}/app.bsky.feed.post/3cached`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith('resolveMiniDoc')) {
        return new Response(
          JSON.stringify({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          uri: recordUri,
          cid,
          value: { $type: 'app.bsky.feed.post', text: 'Cached', createdAt: '2026-01-01T00:00:00Z' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const service = new PublicDataService(queryClient)

    await service.identity('atproto.com')
    await service.identity('atproto.com')
    await service.record(recordUri)
    await service.record(recordUri)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.setSystemTime(Date.now() + CACHE_TTL_MS.identity + 1)
    await service.identity('atproto.com')
    await service.record(recordUri)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('requests the newest Constellation backlinks first', async () => {
    let requestedUrl: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input instanceof Request ? input.url : String(input))
        return new Response(JSON.stringify({ total: 0, records: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const service = createTestService()
    await expect(service.blockedBy(did)).resolves.toEqual({ items: [], cursor: undefined })
    expect(requestedUrl?.searchParams.get('reverse')).toBe('false')
  })

  it('rejects malformed backlink subjects before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getBacklinks({ subject: 'not a URI', source: 'app.bsky.graph.block:subject' })).rejects.toThrow(
      'invalid subject URI',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hydrates list members from list backlinks', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3list`
    const memberDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    let backlinkSubject: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname.endsWith('getBacklinks')) {
          backlinkSubject = url.searchParams.get('subject')
          return new Response(
            JSON.stringify({ total: 1, records: [{ did, collection: 'app.bsky.graph.listitem', rkey: '3member' }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        if (url.pathname.endsWith('resolveMiniDoc')) {
          return new Response(
            JSON.stringify({
              did: memberDid,
              handle: 'member.example',
              pds: 'https://pds.example',
              signing_key: 'zQ3test',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        const uri = url.searchParams.get('at_uri') || ''
        if (uri.includes('/app.bsky.graph.listitem/')) {
          return new Response(
            JSON.stringify({
              uri,
              cid,
              value: {
                $type: 'app.bsky.graph.listitem',
                subject: memberDid,
                list: listUri,
                createdAt: '2026-01-05T00:00:00Z',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({ uri, cid, value: { $type: 'app.bsky.actor.profile', displayName: 'List Member' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )

    const service = createTestService()
    const page = await service.listMembers(listUri)
    expect(backlinkSubject).toBe(listUri)
    expect(page.items[0]).toMatchObject({ kind: 'relationship', actor: { kind: 'actorReference', did: memberDid } })
  })

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
                  {
                    uri: newerUri,
                    cid,
                    value: { $type: 'app.bsky.feed.post', text: 'Newer post', createdAt: '2026-04-02T00:00:00Z' },
                  },
                  {
                    uri: olderUri,
                    cid,
                    value: { $type: 'app.bsky.feed.post', text: 'Older post', createdAt: '2026-04-01T00:00:00Z' },
                  },
                ],
                cursor: 'older-posts',
              }
          return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
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
          return new Response(JSON.stringify({ labels }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (url.pathname.endsWith('resolveMiniDoc')) {
          identityRequests += 1
          return new Response(
            JSON.stringify({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const service = createTestService()
    const page = await service.labeledPosts(identity)
    expect(repositoryLimit).toBe('12')
    expect(labelSubjects).toEqual(expect.arrayContaining([newerUri, olderUri]))
    expect(labelSubjects).toHaveLength(2)
    expect(page.cursor).toBeDefined()
    expect(page.items.map((item) => item.uri)).toEqual([newerUri, olderUri])
    expect(page.items[0]?.labels.map((label) => label.value)).toEqual(['second-label', 'first-label'])
    expect(page.items[0]?.labels[0]?.source).toMatchObject({ kind: 'actorReference', did: sourceDid })
    expect(page.items[0]?.post).toMatchObject({ kind: 'post', author: { kind: 'actorReference', did } })
    expect(page.items[0]?.post).toMatchObject({ repository: identity })
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
            return new Response(
              JSON.stringify({
                records: [
                  {
                    uri: unlabeledUri,
                    cid,
                    value: { $type: 'app.bsky.feed.post', text: 'No labels here', createdAt: '2026-09-02T00:00:00Z' },
                  },
                ],
                cursor: 'older-posts',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          return new Response(
            JSON.stringify({
              records: [
                {
                  uri: labeledUri,
                  cid,
                  value: { $type: 'app.bsky.feed.post', text: 'Found later', createdAt: '2026-09-01T00:00:00Z' },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        if (url.hostname === 'labelers.firehose.stream') {
          const subject = url.searchParams.get('uriPatterns')
          return new Response(
            JSON.stringify({
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
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )

    const service = createTestService()
    const firstPage = await service.labeledPosts(identity)
    expect(firstPage.items).toEqual([])
    expect(firstPage.cursor).toBeDefined()

    const secondPage = await service.labeledPosts(identity, firstPage.cursor)
    expect(secondPage.items).toMatchObject([
      {
        uri: labeledUri,
        post: { kind: 'post', text: 'Found later' },
        labels: [{ value: 'graphic-media' }],
      },
    ])
    expect(secondPage.cursor).toBeUndefined()
  })

  it('caches raw repository pages independently of their hydrated rows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const blockedDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'pds.example') {
        return new Response(
          JSON.stringify({
            records: [
              {
                uri: `at://${did}/app.bsky.graph.block/cached`,
                cid,
                value: { $type: 'app.bsky.graph.block', subject: blockedDid, createdAt: '2026-01-01T00:00:00Z' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.pathname.endsWith('resolveMiniDoc')) {
        return new Response(
          JSON.stringify({
            did: blockedDid,
            handle: 'blocked.example',
            pds: 'https://pds.example',
            signing_key: 'zQ3test',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      const uri = url.searchParams.get('at_uri') ?? ''
      return new Response(
        JSON.stringify({ uri, cid, value: { $type: 'app.bsky.actor.profile', displayName: 'Blocked account' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const service = createTestService()

    await service.blocking(identity)
    await service.blocking(identity)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + CACHE_TTL_MS.activity + 1)
    await service.blocking(identity)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns relationship rows without starting profile hydration', async () => {
    const blockedDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'pds.example') {
        return new Response(
          JSON.stringify({
            records: [
              {
                uri: `at://${did}/app.bsky.graph.block/3abc`,
                cid,
                value: { $type: 'app.bsky.graph.block', subject: blockedDid, createdAt: '2026-01-01T00:00:00Z' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      throw new Error(`Unexpected profile request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = createTestService()
    const page = await service.blocking(identity)
    expect(page.items).toEqual([
      expect.objectContaining({
        kind: 'relationship',
        actor: expect.objectContaining({ kind: 'actorReference', did: blockedDid }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('retries only transient XRPC errors and honors Retry-After', () => {
    const rateLimit = new ClientResponseError({
      status: 429,
      headers: new Headers({ 'Retry-After': '2' }),
      data: { error: 'RateLimitExceeded' },
    })
    const invalid = new ClientResponseError({ status: 400, data: { error: 'InvalidRequest' } })
    expect(shouldRetry(0, rateLimit)).toBe(true)
    expect(retryDelay(0, rateLimit)).toBe(2_000)
    expect(shouldRetry(0, invalid)).toBe(false)
    expect(shouldRetry(3, rateLimit)).toBe(false)
  })
})
