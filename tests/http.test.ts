import { ClientResponseError } from '@atcute/client'
import { describe, expect, it } from 'vitest'
import { retryDelay, shouldRetry } from '../src/lib/http'

describe('http', () => {
  it('retries only transient XRPC errors and honors Retry-After', () => {
    const rateLimit = new ClientResponseError({
      status: 429,
      headers: new Headers({ 'Retry-After': '2' }),
      data: { error: 'RateLimitExceeded' },
    })
    const invalid = new ClientResponseError({ status: 400, data: { error: 'InvalidRequest' } })
    expect(shouldRetry(0, rateLimit)).toBe(true)
    expect(retryDelay(0, rateLimit)).toBe(2_000)
    expect(shouldRetry(0, invalid)).toBe(false)
    expect(shouldRetry(3, rateLimit)).toBe(false)
  })
})
