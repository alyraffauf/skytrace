import { describe, expect, it, vi } from 'vitest'
import { PublicDataService } from '../src/data/publicData'
import { validateIdentity } from '../src/data/api/identity'
import type { ActorIdentity } from '../src/types'
import { createTestQueryClient, jsonResponse as response, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
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

describe('actor data', () => {
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
    stubProfileRecord(
      repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, {
        $type: 'app.bsky.actor.profile',
        ...(labels && {
          labels: {
            $type: 'com.atproto.label.defs#selfLabels',
            values: labels,
          },
        }),
      }),
    )

    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actors.actorProfileQueryOptions('atproto.com'))).resolves.toMatchObject(
      {
        hasNoUnauthenticatedSelfLabel: expected,
      },
    )
  })

  it('returns an identity-only profile when the profile record was deleted', async () => {
    stubProfileRecord({ error: 'NotFound', message: 'Deleted' }, 404)
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actors.actorProfileQueryOptions('atproto.com'))).resolves.toEqual({
      kind: 'actorProfile',
      identity,
      hasNoUnauthenticatedSelfLabel: false,
    })
  })

  it.each([{ displayName: 42 }, { description: ['invalid'] }, { avatar: 'not-a-blob' }])(
    'preserves a valid privacy self-label despite invalid profile fields: %j',
    async (invalidFields) => {
      stubProfileRecord(
        repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, {
          $type: 'app.bsky.actor.profile',
          ...invalidFields,
          labels: {
            $type: 'com.atproto.label.defs#selfLabels',
            values: [{ val: '!no-unauthenticated' }],
          },
        }),
      )

      const queryClient = createTestQueryClient()
      const service = new PublicDataService(queryClient)
      await expect(queryClient.fetchQuery(service.actors.actorProfileQueryOptions(did))).resolves.toMatchObject({
        hasNoUnauthenticatedSelfLabel: true,
        displayName: undefined,
        description: undefined,
        avatarCid: undefined,
      })
    },
  )

  it('does not read privacy labels from an invalid self-label container', async () => {
    stubProfileRecord(
      repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, {
        $type: 'app.bsky.actor.profile',
        labels: {
          $type: 'not-self-labels',
          values: [{ val: '!no-unauthenticated' }],
        },
      }),
    )

    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actors.actorProfileQueryOptions(did))).resolves.toMatchObject({
      hasNoUnauthenticatedSelfLabel: false,
    })
  })

  it('returns an identity-only profile for a malformed profile envelope', async () => {
    stubProfileRecord({ uri: 'not-an-at-uri', value: {} })
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actors.actorProfileQueryOptions('atproto.com'))).resolves.toEqual({
      kind: 'actorProfile',
      identity,
      hasNoUnauthenticatedSelfLabel: false,
    })
  })

  it('surfaces transient failures while loading the primary profile', async () => {
    stubProfileRecord({ error: 'UpstreamFailure', message: 'Try later' }, 503)
    const queryClient = createTestQueryClient()
    const service = new PublicDataService(queryClient)
    await expect(queryClient.fetchQuery(service.actors.actorProfileQueryOptions('atproto.com'))).rejects.toMatchObject({
      status: 503,
    })
  })
})
