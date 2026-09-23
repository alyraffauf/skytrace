import { encode } from '@atcute/cbor'
import { CODEC_DCBOR, fromDigest, toString } from '@atcute/cid'
import { sha256 } from '@noble/hashes/sha2.js'

export function recordValueCid(value: unknown): string {
  return toString(fromDigest(CODEC_DCBOR, sha256(encode(value))))
}

export function recordCidMatches(value: unknown, expectedCid: string): boolean {
  return recordValueCid(value) === expectedCid
}
