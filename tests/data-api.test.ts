import { ClientResponseError } from '@atcute/client'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import {
  countRecords,
  getBacklinks,
  getBacklinksCount,
  listRecords,
  queryLabels,
  validateIdentity,
} from '../src/data/xrpc'
import { CACHE_TTL_MS } from '../src/lib/cache'
import { retryDelay, shouldRetry } from '../src/lib/http'
import type { ActorIdentity } from '../src/types'
import { createTestQueryClient, createTestService, jsonResponse as response } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }

function stubProfileRecord(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.pathname.endsWith('resolveMiniDoc')
        ? response({ did, handle: identity.handle, pds: identity.pds, signing_key: 'zQ3test' })
        : response(body, status)
    }),
  )
}

describe('atcute-backed API boundaries', () => {
  it('paginates PDS records without inventing fake raw records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.hostname === 'pds.example')
          return response({
            records: [
              {
                uri: `at://${did}/app.bsky.graph.block/3abc`,
                cid,
                value: { $type: 'app.bsky.graph.block', createdAt: '2026-01-01T00:00:00Z' },
              },
              { uri: 'not-an-at-uri', value: {} },
            ],
            cursor: 'next',
          })
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

  it('counts every page beyond the former request budget', async () => {
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

  it('paginates labels and contains malformed events to one unavailable row', async () => {
    const sourceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
    let requestedUrl: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input instanceof Request ? input.url : String(input))
        return response({
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
        })
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

  it.each([
    ['the exact privacy self-label', [{ val: '!no-unauthenticated' }], true],
    ['unrelated self-labels', [{ val: 'porn' }, { val: '!NO-UNAUTHENTICATED' }], false],
    ['no self-labels', undefined, false],
  ])('reads %s from the profile record', async (_description, labels, expected) => {
    stubProfileRecord({
      uri: `at://${did}/app.bsky.actor.profile/self`,
      cid,
      value: {
        $type: 'app.bsky.actor.profile',
        ...(labels && {
          labels: {
            $type: 'com.atproto.label.defs#selfLabels',
            values: labels,
          },
        }),
      },
    })

    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actorProfileQueryOptions('atproto.com'))).resolves.toMatchObject({
      hasNoUnauthenticatedSelfLabel: expected,
    })
  })

  it('reads pronouns from the profile record', async () => {
    stubProfileRecord({
      uri: `at://${did}/app.bsky.actor.profile/self`,
      cid,
      value: { $type: 'app.bsky.actor.profile', pronouns: 'they/them' },
    })

    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actorProfileQueryOptions('atproto.com'))).resolves.toMatchObject({
      pronouns: 'they/them',
    })
  })

  it('returns an identity-only profile when the profile record was deleted', async () => {
    stubProfileRecord({ error: 'NotFound', message: 'Deleted' }, 404)
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actorProfileQueryOptions('atproto.com'))).resolves.toEqual({
      kind: 'actorProfile',
      identity,
      hasNoUnauthenticatedSelfLabel: false,
    })
  })

  it('returns an identity-only profile for a malformed profile envelope', async () => {
    stubProfileRecord({ uri: 'not-an-at-uri', value: {} })
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actorProfileQueryOptions('atproto.com'))).resolves.toEqual({
      kind: 'actorProfile',
      identity,
      hasNoUnauthenticatedSelfLabel: false,
    })
  })

  it('surfaces transient failures while loading the primary profile', async () => {
    stubProfileRecord({ error: 'UpstreamFailure', message: 'Try later' }, 503)
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actorProfileQueryOptions('atproto.com'))).rejects.toMatchObject({
      status: 503,
    })
  })

  it('reuses identity and record reads until their TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const recordUri = `at://${did}/app.bsky.feed.post/3cached`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith('resolveMiniDoc')) {
        return response({ did, handle: 'atproto.com', pds: 'https://pds.example', signing_key: 'zQ3test' })
      }
      return response({
        uri: recordUri,
        cid,
        value: { $type: 'app.bsky.feed.post', text: 'Cached', createdAt: '2026-01-01T00:00:00Z' },
      })
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
        return response({ total: 0, records: [] })
      }),
    )

    const service = createTestService()
    await expect(service.blockedBy(did)).resolves.toEqual({ items: [], cursor: undefined })
    expect(requestedUrl?.searchParams.get('reverse')).toBe('false')
  })

  it('finds an account blocking the configured account across Constellation pages', async () => {
    const blockTargetDid = 'did:plc:jwxdvd2mdtdq7la7toiy2rjc'
    const otherDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const requestedUrls: URL[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        requestedUrls.push(url)
        if (!url.searchParams.has('cursor')) {
          return response({
            total: 2,
            records: [{ did: otherDid, collection: 'app.bsky.graph.block', rkey: '3other' }],
            cursor: 'next',
          })
        }
        return response({
          total: 2,
          records: [{ did, collection: 'app.bsky.graph.block', rkey: '3skytrace' }],
          cursor: null,
        })
      }),
    )

    await expect(createTestService().actorBlocksConfiguredAccount(did, blockTargetDid)).resolves.toBe(true)
    expect(requestedUrls).toHaveLength(2)
    expect(requestedUrls[0]?.searchParams.get('subject')).toBe(blockTargetDid)
    expect(requestedUrls[0]?.searchParams.get('source')).toBe('app.bsky.graph.block:subject')
    expect(requestedUrls[1]?.searchParams.get('cursor')).toBe('next')
  })

  it('gets a block backlink count without loading backlink records', async () => {
    let requestedUrl: URL | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrl = new URL(input instanceof Request ? input.url : String(input))
        return response({ total: 3_000 })
      }),
    )

    await expect(getBacklinksCount({ subject: did, source: 'app.bsky.graph.block:subject' })).resolves.toBe(3_000)
    expect(requestedUrl?.pathname).toMatch(/blue\.microcosm\.links\.getBacklinksCount$/)
    expect(requestedUrl?.searchParams.get('subject')).toBe(did)
    expect(requestedUrl?.searchParams.get('source')).toBe('app.bsky.graph.block:subject')
    expect(requestedUrl?.searchParams.has('limit')).toBe(false)
  })

  it('loads each relationship count through its own query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          return response({ records: [{}, {}] })
        }
        if (url.pathname.endsWith('getBacklinksCount')) {
          return response({ total: 3_000 })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const service = new PublicDataService(queryClient)
    const listUri = `at://${did}/app.bsky.graph.list/3skytrace`

    await expect(queryClient.fetchQuery(service.blockedCountQueryOptions(identity))).resolves.toBe(2)
    await expect(queryClient.fetchQuery(service.blockedByCountQueryOptions(did))).resolves.toBe(3_000)
    await expect(queryClient.fetchQuery(service.listBlockCountQueryOptions(listUri))).resolves.toBe(3_000)
  })

  it('keeps a successful relationship count when the other source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname === 'pds.example') {
          return response({ error: 'Unavailable' }, 503)
        }
        if (url.pathname.endsWith('getBacklinksCount')) {
          return response({ total: 12 })
        }
        throw new Error(`Unexpected URL ${url}`)
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const service = new PublicDataService(queryClient)
    const [blocked, blockedBy] = await Promise.allSettled([
      queryClient.fetchQuery(service.blockedCountQueryOptions(identity)),
      queryClient.fetchQuery(service.blockedByCountQueryOptions(did)),
    ])

    expect(blocked.status).toBe('rejected')
    expect(blockedBy).toEqual({ status: 'fulfilled', value: 12 })
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
          return response({ total: 1, records: [{ did, collection: 'app.bsky.graph.listitem', rkey: '3member' }] })
        }
        if (url.pathname.endsWith('resolveMiniDoc')) {
          return response({
            did: memberDid,
            handle: 'member.example',
            pds: 'https://pds.example',
            signing_key: 'zQ3test',
          })
        }
        const uri = url.searchParams.get('at_uri') || ''
        if (uri.includes('/app.bsky.graph.listitem/')) {
          return response({
            uri,
            cid,
            value: {
              $type: 'app.bsky.graph.listitem',
              subject: memberDid,
              list: listUri,
              createdAt: '2026-01-05T00:00:00Z',
            },
          })
        }
        return response({ uri, cid, value: { $type: 'app.bsky.actor.profile', displayName: 'List Member' } })
      }),
    )

    const service = createTestService()
    const page = await service.listMembers(listUri)
    expect(backlinkSubject).toBe(listUri)
    expect(page.items).toEqual([{ uri: `at://${did}/app.bsky.graph.listitem/3member` }])
  })

  it('returns list-member backlinks without waiting for every membership record', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3large`
    const memberCount = 96
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname.endsWith('getBacklinks')) {
          return response({
            total: memberCount,
            records: Array.from({ length: memberCount }, (_, index) => ({
              did,
              collection: 'app.bsky.graph.listitem',
              rkey: `3member${index}`,
            })),
          })
        }
        throw new Error(`Unexpected request for ${url.pathname}`)
      }),
    )

    const page = await createTestService().listMembers(listUri)

    expect(page.items).toHaveLength(memberCount)
    expect(page.items.every((item) => item.uri.includes('/app.bsky.graph.listitem/'))).toBe(true)
  })

  it('hydrates a list member after its backlink page has loaded', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3streamed`
    const memberDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
    const membershipUri = `at://${did}/app.bsky.graph.listitem/3member`
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.pathname.endsWith('getBacklinks'))
          return response({ total: 1, records: [{ did, collection: 'app.bsky.graph.listitem', rkey: '3member' }] })
        return response({
          uri: membershipUri,
          cid,
          value: {
            $type: 'app.bsky.graph.listitem',
            subject: memberDid,
            list: listUri,
            createdAt: '2026-01-05T00:00:00Z',
          },
        })
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const service = new PublicDataService(queryClient)

    await expect(service.listMembers(listUri)).resolves.toMatchObject({ items: [{ uri: membershipUri }] })
    await expect(queryClient.fetchQuery(service.listMemberQueryOptions(listUri, membershipUri))).resolves.toMatchObject(
      {
        kind: 'relationship',
        actor: { did: memberDid },
      },
    )
  })

  it('calls a fetched but invalid list membership malformed', async () => {
    const listUri = `at://${did}/app.bsky.graph.list/3streamed`
    const membershipUri = `at://${did}/app.bsky.graph.listitem/3member`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          uri: membershipUri,
          cid,
          value: {
            $type: 'app.bsky.graph.listitem',
            subject: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
            list: `at://${did}/app.bsky.graph.list/3other`,
            createdAt: '2026-01-05T00:00:00Z',
          },
        }),
      ),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    await expect(
      queryClient.fetchQuery(new PublicDataService(queryClient).listMemberQueryOptions(listUri, membershipUri)),
    ).resolves.toMatchObject({ kind: 'unavailable', reason: 'This list membership is malformed.' })
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
    const page = await service.labeledPosts(identity)
    expect(repositoryLimit).toBe('12')
    expect(labelSubjects).toEqual(expect.arrayContaining([newerUri, olderUri]))
    expect(labelSubjects).toHaveLength(2)
    expect(page.cursor).toBeDefined()
    expect(page.items.map((item) => item.post.uri)).toEqual([newerUri, olderUri])
    expect(page.items[0]?.labels.map((label) => label.value)).toEqual(['second-label', 'first-label'])
    expect(page.items[0]?.labels[0]?.source).toMatchObject({ kind: 'actorReference', did: sourceDid })
    expect(page.items[0]?.post).toMatchObject({ kind: 'post', author: { kind: 'actorReference', did } })
    expect(page.items[0]?.post).toMatchObject({ repositoryPds: identity.pds })
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
                {
                  uri: unlabeledUri,
                  cid,
                  value: { $type: 'app.bsky.feed.post', text: 'No labels here', createdAt: '2026-09-02T00:00:00Z' },
                },
              ],
              cursor: 'older-posts',
            })
          }
          return response({
            records: [
              {
                uri: labeledUri,
                cid,
                value: { $type: 'app.bsky.feed.post', text: 'Found later', createdAt: '2026-09-01T00:00:00Z' },
              },
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
    const firstPage = await service.labeledPosts(identity)
    expect(firstPage.items).toEqual([])
    expect(firstPage.cursor).toBeDefined()

    const secondPage = await service.labeledPosts(identity, firstPage.cursor)
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
                  {
                    uri: validUri,
                    cid,
                    value: { $type: 'app.bsky.feed.post', text: 'Still reachable', createdAt: '2026-08-01T00:00:00Z' },
                  },
                ],
              })
            : response({
                records: [{ uri: malformedUri, cid, value: { $type: 'app.bsky.feed.post', text: 42 } }],
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
    const malformedPage = await publicData.labeledPosts(identity)
    expect(malformedPage.items).toEqual([])
    expect(malformedPage.cursor).toBeDefined()

    const validPage = await publicData.labeledPosts(identity, malformedPage.cursor)
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
              {
                uri: validUri,
                cid,
                value: { $type: 'app.bsky.feed.post', text: 'Visible', createdAt: '2026-08-01T00:00:00Z' },
              },
              { uri: malformedUri, cid, value: { $type: 'app.bsky.feed.post' } },
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

    const page = await createTestService().labeledPosts(identity)
    expect(page.items.map((item) => item.post.uri)).toEqual([validUri])
  })

  it('caches raw repository pages independently of their hydrated rows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const blockedDid = 'did:plc:xwc5pfr4q6kthctktdb5turw'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'pds.example') {
        return response({
          records: [
            {
              uri: `at://${did}/app.bsky.graph.block/cached`,
              cid,
              value: { $type: 'app.bsky.graph.block', subject: blockedDid, createdAt: '2026-01-01T00:00:00Z' },
            },
          ],
        })
      }
      if (url.pathname.endsWith('resolveMiniDoc')) {
        return response({
          did: blockedDid,
          handle: 'blocked.example',
          pds: 'https://pds.example',
          signing_key: 'zQ3test',
        })
      }
      const uri = url.searchParams.get('at_uri') ?? ''
      return response({ uri, cid, value: { $type: 'app.bsky.actor.profile', displayName: 'Blocked account' } })
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
        return response({
          records: [
            {
              uri: `at://${did}/app.bsky.graph.block/3abc`,
              cid,
              value: { $type: 'app.bsky.graph.block', subject: blockedDid, createdAt: '2026-01-01T00:00:00Z' },
            },
          ],
        })
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
