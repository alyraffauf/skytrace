import { isBlob } from '@atcute/lexicons/interfaces'
import * as v from '@atcute/lexicons/validations'
import type { Cid } from '@atcute/lexicons/syntax'
import type { RawRecord } from '../types'

type RecordValue = Record<string, unknown>

export function objectValue(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function blobCid(value: unknown): Cid | undefined {
  return isBlob(value) ? value.ref.$link : undefined
}

export function parsedRecord<T>(schema: v.BaseSchema<unknown, T>, record?: RawRecord): T | undefined {
  if (!record) return undefined
  const result = v.safeParse(schema, record.value)
  return result.ok ? result.value : undefined
}
