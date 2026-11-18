// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { usePagedRecords } from '../../src/hooks/usePagedRecords'
import type { CursorHistory } from '../../src/data/cursorHistory'
import type { Page } from '../../src/types'

// Exercise the actual query callbacks without depending on observer scheduling.
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: (options: unknown) => options }))
type Param = { cursor: string; requestedCursors?: CursorHistory } | undefined
type Options = {
  queryFn: (context: { pageParam: Param; signal: AbortSignal }) => Promise<Page<number>>
  getNextPageParam: (page: Page<number>, pages: Page<number>[], param: Param) => Param
}

it('stops generated cursor cycles before making duplicate requests, and starts fresh histories independently', async () => {
  const cases = Number(process.env.PAGING_CASES ?? 300)
  const coverage = { cycle: 0, complete: 0, requests: 0, emptyToken: 0, retry: 0 }
  for (let seed = 1; seed <= cases; seed++) {
    const length = 1 + (seed % 19)
    const cyclic = seed % 3 !== 0
    const tokens = Array.from({ length }, (_, index) => (index === 0 && seed % 2 === 0 ? '' : `cursor-${index}`))
    const requests: Array<string | undefined> = []
    const load = async (cursor: string | undefined): Promise<Page<number>> => {
      requests.push(cursor)
      const index = cursor === undefined ? 0 : tokens.indexOf(cursor) + 1
      return { items: [index], cursor: index < length ? tokens[index] : cyclic ? tokens[seed % length] : undefined }
    }
    for (let replay = 0; replay < 2; replay++) {
      const view = renderHook(() => usePagedRecords(['generated', seed, replay], load))
      const options = view.result.current as unknown as Options
      let param: Param
      const requested: Array<string | undefined> = []
      for (let step = 0; step <= length + 2; step++) {
        if (requested.includes(param?.cursor)) {
          const count = requests.length
          await expect(options.queryFn({ pageParam: param, signal: new AbortController().signal })).rejects.toThrow(
            'repeated a pagination cursor',
          )
          // Retrying a failed next page must still reject without calling the loader.
          await expect(options.queryFn({ pageParam: param, signal: new AbortController().signal })).rejects.toThrow(
            'repeated a pagination cursor',
          )
          expect(requests).toHaveLength(count)
          coverage.cycle++
          coverage.retry++
          break
        }
        requested.push(param?.cursor)
        if (param?.cursor === '') coverage.emptyToken++
        const page = await options.queryFn({ pageParam: param, signal: new AbortController().signal })
        coverage.requests++
        expect(page.items).toEqual([requested.length - 1])
        param = options.getNextPageParam(page, [], param)
        if (!param) {
          coverage.complete++
          break
        }
        if (step === length + 2) throw new Error(`nontermination seed=${seed}`)
      }
      expect(requested).toEqual([undefined, ...tokens])
      view.unmount()
    }
  }
  console.info('hook coverage', coverage)
  for (const count of Object.values(coverage)) expect(count).toBeGreaterThan(0)
})
