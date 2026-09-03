import { ComAtprotoLabelDefs, ComAtprotoRepoListRecords } from '@atcute/atproto'
import { Client, ok, simpleFetchHandler } from '@atcute/client'
import type { ActorIdentifier, CanonicalResourceUri, Did, GenericUri, Nsid } from '@atcute/lexicons/syntax'
import { isCanonicalResourceUri, isCid, isGenericUri, isHandle } from '@atcute/lexicons/syntax'
import * as v from '@atcute/lexicons/validations'
import type {} from '@atcute/microcosm'
import type {} from '@atcute/bluesky'
import type {
  AccountDetails,
  ActorIdentity,
  ActorSuggestion,
  LabelEvent,
  Page,
  RawRecord,
  RepositoryRecord,
  UnavailableItem,
} from '../types'
import { dedupeBy } from '../lib/collections'
import { isDid, parseAtUri } from '../lib/parse'
import { hydrationRequests, paginationRequests } from '../lib/requestScheduler'
import { objectValue, stringValue } from './recordParsers'

const SLINGSHOT_URL = 'https://slingshot.cute.haus'
const CONSTELLATION_URL = 'https://constellation.microcosm.blue'
export const LABEL_RELAY_URL = 'https://labelers.firehose.stream'
export const BLUESKY_APPVIEW_URL = 'https://public.api.bsky.app'
const TYPEAHEAD_URL = 'https://typeahead.waow.tech'
const PLC_DIRECTORY_URL = 'https://plc.directory'

export class PublicDataValidationError extends Error {}

const MAX_CLIENTS = 32
const clients = new Map<string, Client>()
const backlinkSources = [
  'app.bsky.graph.block:subject',
  'app.bsky.graph.listitem:list',
  'app.bsky.graph.listitem:subject',
] as const
type BacklinkSource = (typeof backlinkSources)[number]

function clientFor(service: string): Client {
  let client = clients.get(service)
  if (client) {
    clients.delete(service)
    clients.set(service, client)
    return client
  }

  client = new Client({
    handler: simpleFetchHandler({
      service,
      fetch: (input, init) => {
        if (service !== TYPEAHEAD_URL) return fetch(input, init)
        const headers = new Headers(init?.headers)
        headers.set('X-Client', 'skytrace')
        return fetch(input, { ...init, headers })
      },
    }),
  })
  clients.set(service, client)
  if (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value!)
  return client
}

const backlinksSchema = v.query('blue.microcosm.links.getBacklinks', {
  params: v.object({
    subject: v.genericUriString(),
    source: v.string(),
    limit: v.optional(v.integer()),
    cursor: v.optional(v.string()),
    reverse: v.optional(v.boolean()),
  }),
  output: {
    type: 'lex',
    schema: v.object({
      total: v.integer(),
      records: v.array(v.object({ did: v.didString(), collection: v.nsidString(), rkey: v.recordKeyString() })),
      cursor: v.optional(v.nullable(v.string())),
    }),
  },
})

// A loose page envelope keeps one malformed PDS record from discarding its peers.
const listRecordsSchema = v.query('com.atproto.repo.listRecords', {
  params: v.object({
    repo: v.actorIdentifierString(),
    collection: v.nsidString(),
    limit: v.optional(v.integer()),
    cursor: v.optional(v.string()),
    reverse: v.optional(v.boolean()),
  }),
  output: {
    type: 'lex',
    schema: v.object({
      records: v.array(v.unknown()),
      cursor: v.optional(v.string()),
    }),
  },
})

// Keep the page envelope loose so a single bad label becomes an unavailable row.
const queryLabelsSchema = v.query('com.atproto.label.queryLabels', {
  params: v.object({
    cursor: v.optional(v.string()),
    limit: v.optional(v.integer()),
    sources: v.optional(v.array(v.didString())),
    uriPatterns: v.array(v.string()),
  }),
  output: {
    type: 'lex',
    schema: v.object({
      labels: v.array(v.unknown()),
      cursor: v.optional(v.string()),
    }),
  },
})

export function validateIdentity(value: unknown): ActorIdentity {
  const data = objectValue(value)
  const did = stringValue(data?.did)
  const handle = stringValue(data?.handle)
  const pds = stringValue(data?.pds)
  if (!did || !isDid(did) || !handle || !isHandle(handle) || !pds)
    throw new PublicDataValidationError('The identity service returned an incomplete profile.')

  let pdsUrl: URL
  try {
    pdsUrl = new URL(pds)
  } catch {
    throw new PublicDataValidationError('The identity service returned an invalid PDS address.')
  }
  const isSecure = pdsUrl.protocol === 'https:'
  const isLocalDevelopment = pdsUrl.protocol === 'http:' && pdsUrl.hostname === 'localhost'
  if (!isSecure && !isLocalDevelopment)
    throw new PublicDataValidationError('The identity service returned an unsafe PDS address.')
  return { kind: 'actorIdentity', did, handle, pds: pdsUrl.origin as GenericUri }
}

function validateRecord(value: unknown, expectedUri?: string): RawRecord {
  const data = objectValue(value)
  const uri = stringValue(data?.uri)
  const cid = stringValue(data?.cid)
  const recordValue = objectValue(data?.value)
  if (
    !uri ||
    !isCanonicalResourceUri(uri) ||
    !cid ||
    !isCid(cid) ||
    !recordValue ||
    (expectedUri && uri !== expectedUri)
  ) {
    throw new PublicDataValidationError('The record service returned malformed data.')
  }
  return { uri, cid, value: recordValue }
}

export async function resolveActor(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SLINGSHOT_URL).get('blue.microcosm.identity.resolveMiniDoc', {
          params: { identifier: identifier as ActorIdentifier },
          signal,
        }),
      ),
    signal,
  )
  return validateIdentity(data)
}

export async function searchActorsTypeahead(query: string, signal?: AbortSignal): Promise<ActorSuggestion[]> {
  const normalizedQuery = query.trim().replace(/^@/, '')
  if (normalizedQuery.length < 2) return []

  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(TYPEAHEAD_URL).get('app.bsky.actor.searchActorsTypeahead', {
          params: { q: normalizedQuery, limit: 8 },
          signal,
        }),
      ),
    signal,
  )
  return data.actors.map((actor) => ({
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName,
    avatar: actor.avatar,
  }))
}

export async function getPlcAccountDetails(did: string, signal?: AbortSignal): Promise<AccountDetails> {
  if (!/^did:plc:[a-z2-7]{24}$/.test(did)) throw new Error('Cannot fetch PLC history for an invalid DID.')
  const response = await hydrationRequests.run(
    () => fetch(`${PLC_DIRECTORY_URL}/${did}/log/audit`, { signal, headers: { Accept: 'application/json' } }),
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

export async function getRecordByUri(uri: string, signal?: AbortSignal): Promise<RawRecord> {
  if (!parseAtUri(uri)) throw new Error('Cannot fetch an invalid AT URI.')
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SLINGSHOT_URL).get('blue.microcosm.repo.getRecordByUri', {
          params: { at_uri: uri as CanonicalResourceUri },
          signal,
        }),
      ),
    signal,
  )
  return validateRecord(data, uri)
}

export async function listRecords(options: {
  identity: ActorIdentity
  collection: Nsid
  cursor?: string
  limit: number
  signal?: AbortSignal
}): Promise<Page<RepositoryRecord>> {
  const data = await paginationRequests.run(
    () =>
      ok(
        clientFor(options.identity.pds).call(listRecordsSchema, {
          params: {
            repo: options.identity.did as ActorIdentifier,
            collection: options.collection,
            limit: options.limit,
            reverse: false,
            cursor: options.cursor,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
  const items = data.records.map((record, index) => {
    const envelope = v.safeParse(ComAtprotoRepoListRecords.recordSchema, record)
    if (envelope.ok) {
      const parsedUri = parseAtUri(envelope.value.uri)
      if (parsedUri?.did === options.identity.did && parsedUri.collection === options.collection)
        return validateRecord(envelope.value)
    }
    const pageId = options.cursor ?? 'first'
    return {
      kind: 'unavailable' as const,
      id: `${options.collection}:${pageId}:${index}`,
      reason: 'This repository record is malformed.',
    }
  })
  return { items, cursor: data.cursor }
}

export async function getBacklinks(options: {
  subject: string
  source: BacklinkSource
  cursor?: string
  signal?: AbortSignal
}): Promise<Page<{ uri: string }>> {
  if (!isGenericUri(options.subject)) throw new Error('Cannot fetch backlinks for an invalid subject URI.')
  if (!backlinkSources.includes(options.source)) throw new Error('Cannot fetch backlinks for an unsupported source.')
  const data = await paginationRequests.run(
    () =>
      ok(
        clientFor(CONSTELLATION_URL).call(backlinksSchema, {
          params: {
            subject: options.subject as GenericUri,
            source: options.source,
            limit: 25,
            reverse: false,
            cursor: options.cursor,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
  const items = data.records.map((record) => ({ uri: `at://${record.did}/${record.collection}/${record.rkey}` }))
  return { items: dedupeBy(items, (item) => item.uri), cursor: data.cursor ?? undefined }
}

export async function queryLabels(options: {
  uriPatterns: string[]
  service?: string
  sources?: string[]
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<Page<Omit<LabelEvent, 'source'> | UnavailableItem>> {
  const isValidPattern = (pattern: string) =>
    pattern.endsWith('*') ? isGenericUri(pattern.slice(0, -1)) : isGenericUri(pattern)
  if (options.uriPatterns.length === 0 || options.uriPatterns.some((pattern) => !isValidPattern(pattern))) {
    throw new Error('Cannot fetch labels for an invalid subject URI.')
  }
  if (options.sources?.some((source) => !isDid(source)))
    throw new Error('Cannot fetch labels from an invalid source DID.')
  const sources = options.sources as Did[] | undefined
  const matchesSubject = (subject: string) =>
    options.uriPatterns.some((pattern) =>
      pattern.endsWith('*') ? subject.startsWith(pattern.slice(0, -1)) : subject === pattern,
    )
  const data = await paginationRequests.run(
    () =>
      ok(
        clientFor(options.service ?? LABEL_RELAY_URL).call(queryLabelsSchema, {
          params: {
            uriPatterns: options.uriPatterns,
            sources,
            limit: options.limit ?? 50,
            cursor: options.cursor,
          },
          signal: options.signal,
        }),
      ),
    options.signal,
  )
  const pageId = options.cursor ?? 'first'
  const items = data.labels.map((rawLabel, index) => {
    // The relay uses the compact JSON string form for bytes. Normalize it to
    // the lexicon JSON representation before applying atcute's label schema.
    const rawObject = objectValue(rawLabel)
    const normalizedLabel =
      typeof rawObject?.sig === 'string' ? { ...rawObject, sig: { $bytes: rawObject.sig } } : rawLabel
    const result = v.safeParse(ComAtprotoLabelDefs.labelSchema, normalizedLabel)
    if (!result.ok || !matchesSubject(result.value.uri)) {
      return { kind: 'unavailable' as const, id: `label:${pageId}:${index}`, reason: 'This label event is malformed.' }
    }
    const label = result.value
    return {
      kind: 'labelEvent' as const,
      id: `${label.src}:${label.uri}:${label.val}:${label.cts}:${label.neg === true ? 'removed' : 'applied'}`,
      sourceDid: label.src,
      subject: label.uri,
      value: label.val,
      createdAt: label.cts,
      expiresAt: label.exp,
      negated: label.neg === true,
    }
  })
  return { items: dedupeBy(items, (item) => item.id), cursor: data.cursor }
}
