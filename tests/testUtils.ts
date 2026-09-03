import { QueryClient } from '@tanstack/react-query'
import { PublicDataService } from '../src/data/publicData'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
}

export function createTestService(): PublicDataService {
  return new PublicDataService(createTestQueryClient())
}
