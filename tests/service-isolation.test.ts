import { expect, it, vi } from 'vitest'
import { publicDataServiceFor } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import { did, identity } from './actorFixtures'
import { createTestQueryClient, jsonResponse } from './testUtils'

it('reuses services within a query client and keeps identity caches separate between clients', async () => {
  const firstClient = createTestQueryClient()
  const secondClient = createTestQueryClient()
  const firstService = publicDataServiceFor(firstClient)
  const secondService = publicDataServiceFor(secondClient)
  expect(publicDataServiceFor(firstClient)).toBe(firstService)
  expect(secondService).not.toBe(firstService)

  firstClient.setQueryData(queryKeys.identity(did), identity)
  const fetch = vi.fn(async () => jsonResponse({ ...identity, signing_key: 'zQ3test' }))
  vi.stubGlobal('fetch', fetch)
  await expect(firstService.actors.identity(did)).resolves.toEqual(identity)
  expect(fetch).not.toHaveBeenCalled()
  await expect(secondService.actors.identity(did)).resolves.toEqual(identity)
  expect(fetch).toHaveBeenCalledOnce()
})
