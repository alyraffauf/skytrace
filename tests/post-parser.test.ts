import { expect, it, vi } from 'vitest'
import { decodePostRecord } from '../src/data/posts/postParser'
import type { RawRecord } from '../src/types'
import { cid, did } from './actorFixtures'
import { repositoryRecord } from './testUtils'

it('decodes text, facets, media, and a quoted record without fetching identity', () => {
  const fetch = vi.fn(() => {
    throw new Error('Post decoding must not fetch.')
  })
  vi.stubGlobal('fetch', fetch)
  const uri = `at://${did}/app.bsky.feed.post/decoded` as const
  const quoteUri = `at://${did}/app.bsky.feed.post/quoted` as const
  const text = 'Read https://example.com'
  const record: RawRecord = {
    ...repositoryRecord(uri, {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: '2026-01-01T00:00:00Z',
      facets: [
        {
          index: { byteStart: 5, byteEnd: text.length },
          features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }],
        },
      ],
      embed: {
        $type: 'app.bsky.embed.recordWithMedia',
        record: { $type: 'app.bsky.embed.record', record: { uri: quoteUri, cid } },
        media: {
          $type: 'app.bsky.embed.images',
          images: [
            { alt: 'Attached photo', image: { $type: 'blob', ref: { $link: cid }, mimeType: 'image/jpeg', size: 100 } },
          ],
        },
      },
    }),
    uri,
  }
  const snapshot = structuredClone(record)
  expect(decodePostRecord(record)).toMatchObject({
    kind: 'post',
    uri,
    text,
    quoteUri,
    author: { kind: 'actorReference', did },
    facets: [{ byteStart: 5, byteEnd: text.length, href: 'https://example.com' }],
    images: [{ cid, alt: 'Attached photo' }],
  })
  expect(decodePostRecord(record)).not.toHaveProperty('repositoryPds')
  expect(record).toEqual(snapshot)
  expect(fetch).not.toHaveBeenCalled()
})

it('contains malformed post records as unavailable items', () => {
  const uri = `at://${did}/app.bsky.feed.post/malformed` as const
  const record: RawRecord = { ...repositoryRecord(uri, { $type: 'app.bsky.feed.post', text: 42 }), uri }
  expect(decodePostRecord(record)).toMatchObject({ kind: 'unavailable', id: uri })
})

it('uses atcute blob normalization for legacy image attachments', () => {
  const uri = `at://${did}/app.bsky.feed.post/legacy-image` as const
  const record: RawRecord = {
    ...repositoryRecord(uri, {
      $type: 'app.bsky.feed.post',
      text: 'Legacy image',
      createdAt: '2026-01-01T00:00:00Z',
      embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'Old photo', image: { cid, mimeType: 'image/jpeg' } }] },
    }),
    uri,
  }
  const snapshot = structuredClone(record)
  expect(decodePostRecord(record)).toMatchObject({ kind: 'post', images: [{ cid, alt: 'Old photo' }] })
  expect(record).toEqual(snapshot)
})

it('keeps posts with unknown embed variants without treating their fields as known media', () => {
  const uri = `at://${did}/app.bsky.feed.post/future-embed` as const
  const record: RawRecord = {
    ...repositoryRecord(uri, {
      $type: 'app.bsky.feed.post',
      text: 'Future embed',
      createdAt: '2026-01-01T00:00:00Z',
      embed: { $type: 'app.bsky.embed.future', video: { cid, mimeType: 'video/mp4' }, images: [{}] },
    }),
    uri,
  }
  expect(decodePostRecord(record)).toMatchObject({
    kind: 'post',
    text: 'Future embed',
    images: undefined,
    video: undefined,
  })
})
