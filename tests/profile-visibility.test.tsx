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

    expect(await screen.findByRole('alert')).toHaveTextContent('Block check unavailable')
    expect(screen.queryByText('AT Protocol')).not.toBeInTheDocument()
    expect(screen.queryByText('Profile records')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
