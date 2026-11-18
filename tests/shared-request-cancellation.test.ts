import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { SharedQueryRequests } from '../src/data/runtime/sharedQueryRequests'

it.each([
  { reason: 'caller left', early: true },
  { reason: null, early: true },
  { reason: null, early: false },
])('rejects with the consumer signal reason (reason=$reason, early=$early)', async ({ reason, early }) => {
  const client = new QueryClient()
  const requests = new SharedQueryRequests(client, 1000)
  const caller = new AbortController()
  const load = vi.fn(async () => 'record')
  try {
    if (early) caller.abort(reason)
    const read = requests.query({ queryKey: ['record'], staleTime: 100, consumerSignal: caller.signal, load })
    if (!early) caller.abort(reason)
    await expect(read).rejects.toBe(reason)
    expect(load).toHaveBeenCalledTimes(early ? 0 : 1)
  } finally {
    client.clear()
  }
})
