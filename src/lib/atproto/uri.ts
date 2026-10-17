import { parseCanonicalResourceUri, type ParsedCanonicalResourceUri } from '@atcute/lexicons/syntax'

export function tryParseRecordUri(value: string): ParsedCanonicalResourceUri | null {
  try {
    return parseCanonicalResourceUri(value)
  } catch {
    return null
  }
}
