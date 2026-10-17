import { expect, it, vi } from 'vitest'
import { createTestService, repositoryRecord } from './testUtils'
import { cid, did, identity } from './actorFixtures'
import type { RawRecord } from '../src/types'

const blob = { $type: 'blob', ref: { $link: cid }, mimeType: 'video/mp4', size: 100 }

function postRecord(embed?: Record<string, unknown>): RawRecord {
  const uri = `at://${did}/app.bsky.feed.post/media` as const
  return {
    ...repositoryRecord(uri, {
      $type: 'app.bsky.feed.post',
      text: 'A post',
      createdAt: '2026-01-01T00:00:00Z',
      ...(embed ? { embed } : {}),
    }),
    uri,
  }
}

it.each([
  undefined,
  { $type: 'app.bsky.embed.images', images: [{ image: { ...blob, mimeType: 'image/jpeg' }, alt: 'Photo' }] },
])('keeps non-video posts independent of identity lookup, embed=%j', async (embed) => {
  const service = createTestService()
  const lookup = vi.spyOn(service.actors, 'identity').mockRejectedValue(new Error('Identity unavailable'))
  const record = postRecord(embed)
  await expect(service.posts.loadFromRecord({ record })).resolves.toMatchObject({ kind: 'post', text: 'A post' })
  expect(lookup).not.toHaveBeenCalled()
  const controller = new AbortController()
  controller.abort()
  await expect(service.posts.loadFromRecord({ record, signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  })
})

it.each([true, false])('reuses a video repository only when its author matches, match=%s', async (matches) => {
  const service = createTestService()
  const lookup = vi.spyOn(service.actors, 'identity').mockResolvedValue(identity)
  const record = postRecord({ $type: 'app.bsky.embed.video', video: blob })
  const repository = matches
    ? identity
    : { ...identity, did: 'did:plc:xwc5pfr4q6kthctktdb5turw' as const, pds: 'https://other-pds.example' as const }
  await expect(service.posts.loadFromRecord({ record, repository })).resolves.toMatchObject({
    kind: 'post',
    video: { cid },
    repositoryPds: identity.pds,
  })
  expect(lookup).toHaveBeenCalledTimes(matches ? 0 : 1)
  if (!matches) expect(lookup).toHaveBeenCalledWith(did, undefined)
})

it('keeps the post available when its video repository cannot be resolved', async () => {
  const service = createTestService()
  vi.spyOn(service.actors, 'identity').mockRejectedValue(new Error('Identity unavailable'))
  const record = postRecord({ $type: 'app.bsky.embed.video', video: blob })
  await expect(service.posts.loadFromRecord({ record })).resolves.toMatchObject({
    kind: 'post',
    text: 'A post',
    video: { cid },
    repositoryPds: undefined,
  })
})
