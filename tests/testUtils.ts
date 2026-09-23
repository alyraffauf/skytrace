import { encode } from '@atcute/cbor'
import { CODEC_DCBOR, fromDigest, toString } from '@atcute/cid'
import { QueryClient } from '@tanstack/react-query'
import { createHash } from 'node:crypto'
import { PublicDataService } from '../src/data/publicData'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function repositoryRecord(uri: string, value: Record<string, unknown>) {
  const digest = createHash('sha256').update(encode(value)).digest()
  return { uri, cid: toString(fromDigest(CODEC_DCBOR, digest)), value }
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
}

export function createTestService(): PublicDataService {
  return new PublicDataService(createTestQueryClient())
}
