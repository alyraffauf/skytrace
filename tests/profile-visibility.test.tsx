import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Route, createMemoryRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { hiddenProfileDids } from '../src/config/privacy'
import { PublicDataService, publicDataServiceFor } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import { ProfileLayout } from '../src/layouts/ProfileLayout'
import type { ActorProfile } from '../src/types'
import { createTestQueryClient, jsonResponse, repositoryRecord } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const instanceDid = 'did:plc:ar7c4by46qjdydhdevvrndac'
const profile: ActorProfile = {
  kind: 'actorProfile',
  identity: { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' },
  displayName: 'AT Protocol',
  hasNoUnauthenticatedSelfLabel: false,
}

describe('explicitly hidden profiles', () => {
  it.each([
    [did, null],
    ['atproto.com', null],
    ['atproto.com/labeled-posts', instanceDid],
  ])('hides %s with block target %s', async (actorPath, blockTargetDid) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', {
      ignoreNoUnauthenticated: false,
      blockTargetDid,
      hiddenDids: [instanceDid, did],
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith('resolveMiniDoc')) {
        return jsonResponse({ did, handle: profile.identity.handle, pds: profile.identity.pds, signing_key: 'zQ3test' })
      }
      if (url.pathname.endsWith('getRecordByUri')) {
        return jsonResponse(
          repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, {
            $type: 'app.bsky.actor.profile',
            displayName: profile.displayName,
          }),
        )
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()

    render(
      <QueryClientProvider client={client}>
        <main>
          <RouterProvider
            router={createMemoryRouter(
              createRoutesFromElements(
                <>
                  <Route path="profile/:actor" element={<ProfileLayout />}>
                    <Route index element={<div>Profile records</div>} />
                    <Route path="labeled-posts" element={<div>Profile records</div>} />
                  </Route>
                </>,
              ),
              { initialEntries: [`/profile/${actorPath}`] },
            )}
          />
        </main>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeVisible()
    expect(screen.getByText('This profile has been blocked from SkyTrace.')).toBeVisible()
    expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
    expect(document.title).toBe('Profile unavailable — SkyTrace')
    expect(fetchMock).toHaveBeenCalledTimes(actorPath === did ? 0 : 2)
  })

  it('withholds cached profile data and a cached visible decision from an earlier policy', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', {
      ignoreNoUnauthenticated: false,
      blockTargetDid: instanceDid,
      hiddenDids: [did],
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileView('atproto.com'), profile)
    client.setQueryData(queryKeys.profileVisibility('atproto.com', instanceDid, []), { visible: true, profile })

    render(
      <QueryClientProvider client={client}>
        <RouterProvider
          router={createMemoryRouter(
            createRoutesFromElements(
              <>
                <Route path="profile/:actor" element={<ProfileLayout />}>
                  <Route index element={<div>Profile records</div>} />
                </Route>
              </>,
            ),
            { initialEntries: ['/profile/atproto.com'] },
          )}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('This profile has been blocked from SkyTrace.')).toBeVisible()
    expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('hidden DID configuration', () => {
  it.each([undefined, did, [null, 123, 'atproto.com', 'not a DID']])(
    'ignores unset or invalid configuration: %j',
    (hiddenDids) => {
      vi.stubGlobal('__SKYTRACE_CONFIG__', { hiddenDids })
      expect(hiddenProfileDids()).toEqual([])
    },
  )

  it('normalizes valid DIDs for a stable visibility cache key', () => {
    vi.stubGlobal('__SKYTRACE_CONFIG__', { hiddenDids: ['did:web:example.com', did, 'invalid', did] })
    expect(hiddenProfileDids()).toEqual([did, 'did:web:example.com'])
  })
})

describe('unified profile visibility', () => {
  it('keeps the profile and counts withheld while visibility is pending', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [] })
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileView('atproto.com'), profile)
    const service = publicDataServiceFor(client)
    let finishBlockCheck!: (blocked: boolean) => void
    const pendingBlockCheck = new Promise<boolean>((resolve) => {
      finishBlockCheck = resolve
    })
    const blockCheck = vi.spyOn(service.blocks, 'actorBlocksActor').mockReturnValue(pendingBlockCheck)
    const fetchMock = vi.fn(async () => jsonResponse({ records: [], total: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <QueryClientProvider client={client}>
        <RouterProvider
          router={createMemoryRouter(
            createRoutesFromElements(
              <>
                <Route path="profile/:actor" element={<ProfileLayout />}>
                  <Route index element={<div>Profile records</div>} />
                </Route>
              </>,
            ),
            { initialEntries: ['/profile/atproto.com'] },
          )}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(blockCheck).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Loading profile')).toBeVisible()
    expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => finishBlockCheck(false))
    expect(await screen.findByText('Profile records')).toBeVisible()
  })

  it('rechecks visibility when the block target changes', async () => {
    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: null, hiddenDids: [] })
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileView('atproto.com'), profile)
    const service = new PublicDataService(client)
    const blockCheck = vi.spyOn(service.blocks, 'actorBlocksActor').mockResolvedValue(true)

    expect(await client.query(service.profileVisibility.queryOptions('atproto.com'))).toEqual({
      visible: true,
      profile,
    })
    expect(blockCheck).not.toHaveBeenCalled()

    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [] })
    expect(await client.query(service.profileVisibility.queryOptions('atproto.com'))).toEqual({
      visible: false,
      reason: 'instance-block',
    })
    expect(blockCheck).toHaveBeenCalledTimes(2)
  })

  it('keeps an instance-blocked profile hidden after its explicit hide entry is removed', async () => {
    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [did] })
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileView('atproto.com'), profile)
    const service = new PublicDataService(client)
    const blockCheck = vi
      .spyOn(service.blocks, 'actorBlocksActor')
      .mockImplementation(async ({ blockerDid }) => blockerDid === instanceDid)

    expect(await client.query(service.profileVisibility.queryOptions('atproto.com'))).toEqual({
      visible: false,
      reason: 'explicit-hide',
    })
    expect(blockCheck).not.toHaveBeenCalled()

    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [] })
    expect(await client.query(service.profileVisibility.queryOptions('atproto.com'))).toEqual({
      visible: false,
      reason: 'instance-block',
    })
    expect(blockCheck).toHaveBeenCalledTimes(2)
  })

  it('shows an error and withholds the profile when a required block check fails', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [] })
    const client = createTestQueryClient()
    client.setQueryData(queryKeys.profileView('atproto.com'), profile)
    const service = publicDataServiceFor(client)
    vi.spyOn(service.blocks, 'actorBlocksActor').mockRejectedValue(new Error('Block check unavailable'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <QueryClientProvider client={client}>
        <RouterProvider
          router={createMemoryRouter(
            createRoutesFromElements(
              <>
                <Route path="profile/:actor" element={<ProfileLayout />}>
                  <Route index element={<div>Profile records</div>} />
                </Route>
              </>,
            ),
            { initialEntries: ['/profile/atproto.com'] },
          )}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Account unavailable' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
    expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

it.each([
  ['instance-block', 'cid'],
  ['instance-block', 'uri'],
  ['opt-out', 'cid'],
  ['opt-out', 'uri'],
])('withholds the profile when the %s record has a %s integrity fault', async (direction, fault) => {
  vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [] })
  const client = createTestQueryClient()
  client.setQueryData(queryKeys.profileView('atproto.com'), profile)
  const blocker = direction === 'instance-block' ? instanceDid : did
  const subject = direction === 'instance-block' ? did : instanceDid
  const blockUri = `at://${blocker}/app.bsky.graph.block/unverifiable`
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('getBacklinks'))
      return jsonResponse({
        total: 1,
        records:
          url.searchParams.get('did') === blocker
            ? [{ did: blocker, collection: 'app.bsky.graph.block', rkey: 'unverifiable' }]
            : [],
      })
    const record = repositoryRecord(blockUri, {
      $type: 'app.bsky.graph.block',
      subject,
      createdAt: '2026-01-01T00:00:00Z',
    })
    if (fault === 'cid') record.value.createdAt = '2026-01-02T00:00:00Z'
    else record.uri = `at://${blocker}/app.bsky.graph.block/another`
    return jsonResponse(record)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(
    <QueryClientProvider client={client}>
      <RouterProvider
        router={createMemoryRouter(
          createRoutesFromElements(
            <Route path="profile/:actor" element={<ProfileLayout />}>
              <Route index element={<div>Profile records</div>} />
            </Route>,
          ),
          { initialEntries: ['/profile/atproto.com'] },
        )}
      />
    </QueryClientProvider>,
  )
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
  expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
  expect(
    fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .some((url) => url.pathname.endsWith('getBacklinks') && !url.searchParams.has('did')),
  ).toBe(false)
})

describe('profiles resolved without a valid handle', () => {
  it.each([false, true])('keeps the visibility gate when the account opts out: %s', async (optsOut) => {
    vi.stubGlobal('__SKYTRACE_CONFIG__', { blockTargetDid: instanceDid, hiddenDids: [] })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('resolveMiniDoc'))
        return jsonResponse({ error: 'InvalidRequest', message: "Failed to get DID doc's handle" }, 400)
      if (url.hostname === 'plc.directory')
        return jsonResponse({
          id: did,
          service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }],
        })
      if (url.pathname.endsWith('getRecordByUri'))
        return jsonResponse(
          repositoryRecord(`at://${did}/app.bsky.actor.profile/self`, { $type: 'app.bsky.actor.profile' }),
        )
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()
    const service = publicDataServiceFor(client)
    vi.spyOn(service.blocks, 'actorBlocksActor').mockImplementation(
      async ({ blockerDid }) => optsOut && blockerDid === did,
    )
    const blockedCount = vi.spyOn(service.blocks, 'blockedCountQueryOptions')
    const blockedByCount = vi.spyOn(service.blocks, 'blockedByCountQueryOptions')
    // Seed counts so this regression exercises visibility, without starting background scans.
    client.setQueryData(queryKeys.blockedCount({ ...profile.identity, handle: 'handle.invalid' }), 0)
    client.setQueryData(queryKeys.blockedByCount(did), 0)
    render(
      <QueryClientProvider client={client}>
        <RouterProvider
          router={createMemoryRouter(
            createRoutesFromElements(
              <Route path="profile/:actor" element={<ProfileLayout />}>
                <Route index element={<div>Profile records</div>} />
              </Route>,
            ),
            { initialEntries: [`/profile/${did}`] },
          )}
        />
      </QueryClientProvider>,
    )
    if (optsOut) {
      expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeVisible()
      expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
      expect(blockedCount.mock.calls.every(([identity]) => identity === undefined)).toBe(true)
      expect(blockedByCount.mock.calls.every(([identityDid]) => identityDid === undefined)).toBe(true)
    } else {
      expect(await screen.findByRole('heading', { name: did })).toBeVisible()
      expect(screen.getByText('Profile records')).toBeVisible()
    }
  })
})
