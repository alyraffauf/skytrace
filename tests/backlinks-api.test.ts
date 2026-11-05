import { describe, expect, it, vi } from 'vitest'
import { getBacklinks } from '../src/data/api/backlinks'

describe('backlinks api', () => {
  it('rejects malformed backlink subjects before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getBacklinks({ subject: 'not a URI', source: 'app.bsky.graph.block:subject' })).rejects.toThrow(
      'invalid subject URI',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
