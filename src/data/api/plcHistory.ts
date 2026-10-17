import { isPlcDid } from '@atcute/identity'
import type { AccountDetails } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { hydrationRequests } from '../runtime/requestScheduler'
import { objectValue, stringValue } from '../recordValues'
import { PublicDataValidationError } from '../validationError'

export async function getPlcAccountDetails(did: string, signal?: AbortSignal): Promise<AccountDetails> {
  if (!isPlcDid(did)) throw new Error('Cannot fetch PLC history for an invalid DID.')
  const response = await hydrationRequests.run(
    () => fetch(`${SERVICE_URLS.plcDirectory}/${did}/log/audit`, { signal, headers: { Accept: 'application/json' } }),
    signal,
  )
  if (!response.ok) throw new Error(`The PLC directory returned ${response.status}.`)
  return parsePlcAccountDetails(await response.json())
}

export function parsePlcAccountDetails(value: unknown): AccountDetails {
  if (!Array.isArray(value)) throw new PublicDataValidationError('The PLC directory returned malformed history.')
  const entries = value
    .flatMap((rawEntry) => {
      const entry = objectValue(rawEntry)
      const operation = objectValue(entry?.operation)
      const createdAt = stringValue(entry?.createdAt)
      if (!entry || !operation || !createdAt || entry.nullified === true) return []
      const aliases = Array.isArray(operation.alsoKnownAs)
        ? operation.alsoKnownAs.filter((alias): alias is string => typeof alias === 'string')
        : []
      const legacyHandle = stringValue(operation.handle)
      return [{ createdAt, aliases: legacyHandle ? [`at://${legacyHandle}`, ...aliases] : aliases }]
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))

  const aliases = [...new Set(entries.at(-1)?.aliases ?? [])]
  const currentHandles = new Set(
    aliases.filter((alias) => alias.startsWith('at://')).map((alias) => alias.slice(5).toLowerCase()),
  )
  const formerHandles = [
    ...new Set(
      entries
        .flatMap((entry) => entry.aliases)
        .filter((alias) => alias.startsWith('at://'))
        .map((alias) => alias.slice(5))
        .filter((handle) => !currentHandles.has(handle.toLowerCase())),
    ),
  ]

  return { createdAt: entries[0]?.createdAt, aliases, formerHandles }
}
