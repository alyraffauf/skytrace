import { ClientResponseError, ClientValidationError } from '@atcute/client'

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

export function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= 3) return false
  if (error.name === 'TimeoutError') return false
  if (error instanceof ClientResponseError) return error.status === 429 || error.status >= 500
  if (error instanceof ClientValidationError || error.name === 'AbortError') return false
  return error instanceof TypeError
}

export function retryDelay(attempt: number, error: Error): number {
  if (error instanceof ClientResponseError) {
    const delay = retryAfterMilliseconds(error.headers.get('Retry-After'))
    if (delay !== undefined) return Math.min(delay, 15_000)
  }
  return Math.min(1_000 * 2 ** attempt, 8_000)
}
