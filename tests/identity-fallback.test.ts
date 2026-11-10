import { describe, expect, it, vi } from 'vitest'
import { resolveActor } from '../src/data/api/identity'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import { createTestQueryClient, jsonResponse } from './testUtils'

const did = 'did:plc:aqjldtu23ix7m62jm53qzkf4'
const handleFailure = { error: 'InvalidRequest', message: "Failed to get DID doc's handle" }

function documentFor(id = did, endpoint: unknown = 'https://pds.example', type = 'AtprotoPersonalDataServer') {
  return {
    id,
    alsoKnownAs: ['at://unverified.example'],
    service: [{ id: '#atproto_pds', type, serviceEndpoint: endpoint }],
  }
}

function stubResolution(document: unknown, failure = handleFailure, status = 400) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    return url.pathname.endsWith('resolveMiniDoc') ? jsonResponse(failure, status) : jsonResponse(document)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('DID identity fallback', () => {
  it.each([did, 'did:web:account.example'])(
    'resolves %s without trusting its alias or caching a handle',
    async (identifier) => {
      stubResolution(documentFor(identifier))
      const client = createTestQueryClient()
      const service = new PublicDataService(client)
      await expect(service.actors.identity(identifier)).resolves.toEqual({
        kind: 'actorIdentity',
        did: identifier,
        handle: 'handle.invalid',
        pds: 'https://pds.example',
      })
      expect(client.getQueryData(queryKeys.identity('unverified.example'))).toBeUndefined()
      expect(client.getQueryData(queryKeys.identity('handle.invalid'))).toBeUndefined()
    },
  )

  it('accepts a document without aliases and a fully qualified PDS service ID', async () => {
    const document = documentFor()
    document.service[0].id = did + '#atproto_pds'
    stubResolution({ ...document, alsoKnownAs: undefined })
    await expect(resolveActor(did)).resolves.toMatchObject({ handle: 'handle.invalid', pds: 'https://pds.example' })
  })

  it.each([
    documentFor('did:plc:ewvi7nxzyoun6zhxrhs64oiz'),
    { id: did },
    documentFor(did, 'https://pds.example', 'OtherService'),
    documentFor(did, { uri: 'https://pds.example' }),
    documentFor(did, 'not a URL'),
    documentFor(did, 'https://pds.example/path'),
    documentFor(did, 'https://pds.example?query=1'),
    documentFor(did, 'https://pds.example#fragment'),
    documentFor(did, 'http://pds.example'),
  ])('rejects an unusable DID document: %j', async (document) => {
    stubResolution(document)
    await expect(resolveActor(did)).rejects.toThrow()
  })

  it('retains HTTP localhost support', async () => {
    stubResolution(documentFor(did, 'http://localhost:3000'))
    await expect(resolveActor(did)).resolves.toMatchObject({ pds: 'http://localhost:3000' })
  })

  it.each([
    ['account.example', handleFailure, 400],
    ['did:key:zExample', handleFailure, 400],
    [did, { error: 'InvalidRequest', message: 'Other failure' }, 400],
    [did, handleFailure, 503],
  ])('does not bypass an unrelated failure for %s: %j (%s)', async (identifier, failure, status) => {
    const fetchMock = stubResolution(documentFor(), failure, status)
    await expect(resolveActor(identifier)).rejects.toMatchObject({ status })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not start fallback after cancellation', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => {
      controller.abort()
      return jsonResponse(handleFailure, 400)
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(resolveActor(did, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache success when cancelled during document retrieval', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('resolveMiniDoc')) return jsonResponse(handleFailure, 400)
      controller.abort()
      return jsonResponse(documentFor())
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()
    const service = new PublicDataService(client)
    await expect(service.actors.identity(did, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.getQueryData(queryKeys.identity(did))).toBeUndefined()
  })
})
