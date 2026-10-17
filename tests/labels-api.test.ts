import { describe, expect, it, vi } from 'vitest'
import { queryLabels } from '../src/data/api/labels'
import { jsonResponse as response } from './testUtils'

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

describe('labels api', () => {
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
      id: `label:${JSON.stringify(['https://labelers.firehose.stream', [did], [sourceDid], 'first-label', 50])}:1`,
      reason: 'This label event is malformed.',
    })
  })
})
