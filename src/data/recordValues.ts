import * as v from '@atcute/lexicons/validations'
import type { RawRecord } from '../types'

type RecordValue = Record<string, unknown>

export function objectValue(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function parsedRecord<T>(schema: v.BaseSchema<unknown, T>, record?: RawRecord): T | undefined {
  if (!record) return undefined
  const result = v.safeParse(schema, record.value)
  return result.ok ? result.value : undefined
}
