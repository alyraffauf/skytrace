import { loadProviderLabelPage } from './providerLabels'
import type { ActorIdentity, LabelEvent, LabelValueDefinition, Page, UnavailableItem } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { throwIfAborted } from '../../lib/abort'
import { dedupeBy } from '../../lib/collections'
import { timestampFor } from '../../lib/sorting'
import {
  LABEL_PAGE_SIZE,
  readLabelState,
  snapshotLabelState,
  type LabelPagingState,
  type ProviderPagingState,
} from './labelPaging'
import type { PublicDataCore } from '../publicDataCore'
import { actorReference } from '../recordResults'
import { queryOptions } from '@tanstack/react-query'
import { getLabelerEndpoint, isPlcDid, isWebDid } from '@atcute/identity'
import { CACHE_TTL_MS } from '../runtime/cachePolicy'
import { didDocumentResolver } from '../api/didDocumentResolver'
import { queryKeys } from '../queryKeys'
import { labelDefinitionsFromRecord } from './definitionsParser'
import type { SharedQueryRequests } from '../runtime/sharedQueryRequests'
import { PublicDataValidationError } from '../validationError'

// Include Bluesky moderation even when the relay has no events from it.
const BLUESKY_MODERATION_DID = 'did:plc:ar7c4by46qjdydhdevvrndac'

export class LabelDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly sharedRequests: SharedQueryRequests,
  ) {}

  labelDefinitionsQueryOptions(did: ActorIdentity['did']) {
    return queryOptions({
      queryKey: queryKeys.labelDefinitions(did),
      queryFn: async ({ signal }): Promise<LabelValueDefinition[]> => {
        const uri = `at://${did}/app.bsky.labeler.service/self`
        return labelDefinitionsFromRecord(await this.core.record(uri, signal))
      },
      staleTime: CACHE_TTL_MS.identity,
    })
  }

  async labelerEndpoint(did: string, signal?: AbortSignal): Promise<string | undefined> {
    return this.sharedRequests.query(
      queryKeys.labelerEndpoint(did),
      CACHE_TTL_MS.identity,
      async (requestSignal) => {
        if (!isPlcDid(did) && !isWebDid(did)) return undefined
        const document = await didDocumentResolver.resolve(did, { signal: requestSignal })
        const rawEndpoint = getLabelerEndpoint(document)
        if (!rawEndpoint) return undefined
        const url = new URL(rawEndpoint)
        return url.protocol === 'https:' ? url.origin : undefined
      },
      signal,
    )
  }

  async labels(
    did: string,
    cursor?: LabelPagingState,
    signal?: AbortSignal,
  ): Promise<Page<LabelEvent | UnavailableItem, LabelPagingState>> {
    const state = readLabelState(did, cursor)

    if (!state.discoveryDone) {
      const discovery = await this.core.labelRecords({
        service: SERVICE_URLS.labelRelay,
        uriPatterns: [did],
        cursor: state.discoveryCursor,
        repeatedCursorPolicy: 'return-page',
        limit: LABEL_PAGE_SIZE,
        signal,
      })
      const sources = new Set(state.appViewSources ?? [BLUESKY_MODERATION_DID])
      for (const label of discovery.items) {
        if (label.kind !== 'labelEvent') continue
        sources.add(label.sourceDid)
        if (!state.providers.some((provider) => provider.did === label.sourceDid)) {
          state.providers.push({ did: label.sourceDid, done: false, latestEventAt: label.createdAt })
        }
      }
      state.appViewSources = [...sources]
      const seenCursors = new Set(state.seenDiscoveryCursors ?? [])
      state.discoveryDone = !discovery.cursor || seenCursors.has(discovery.cursor)
      state.discoveryCursor = state.discoveryDone ? undefined : discovery.cursor
      if (discovery.cursor) seenCursors.add(discovery.cursor)
      state.seenDiscoveryCursors = [...seenCursors]
      // Save discovery progress before advancing another relay page.
      if (!state.discoveryDone) return { items: [], cursor: snapshotLabelState(state) }
    }

    if (!state.appViewDone) {
      const page = await this.loadAppViewPage({
        did,
        cursor: state.appViewCursor,
        providers: state.providers,
        sources: state.appViewSources ?? [BLUESKY_MODERATION_DID],
        signal,
      })
      const labels = page.items.filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
      state.appViewDone = !page.cursor || state.seenAppViewCursors.includes(page.cursor)
      state.appViewCursor = state.appViewDone ? undefined : page.cursor
      if (page.cursor) state.seenAppViewCursors.push(page.cursor)
      const unavailableItems = page.items.filter((item): item is UnavailableItem => item.kind === 'unavailable')
      return {
        items: [...this.hydrateSources(labels, signal), ...unavailableItems].sort(
          (left, right) =>
            timestampFor(right.kind === 'unavailable' ? undefined : right.createdAt) -
            timestampFor(left.kind === 'unavailable' ? undefined : left.createdAt),
        ),
        cursor: !state.appViewDone || state.providers.length > 0 ? snapshotLabelState(state) : undefined,
      }
    }

    while (true) {
      const providerIndex = state.providers.findIndex((candidate) => !candidate.done && !candidate.failed)
      if (providerIndex < 0) {
        const failedProviders = state.providers.filter((candidate) => candidate.failed)
        if (failedProviders.length === 0) return { items: [] }
        for (const failedProvider of failedProviders) failedProvider.failed = false
        return {
          items: [],
          cursor: snapshotLabelState(state),
          issues: failedProviders.map((failedProvider) => failedProvider.did),
        }
      }
      const { provider, page } = await loadProviderLabelPage({
        provider: state.providers[providerIndex],
        did,
        signal,
        loadLabels: (options) => this.core.labelRecords(options),
        resolveEndpoint: (sourceDid, requestSignal) => this.labelerEndpoint(sourceDid, requestSignal),
      })
      state.providers[providerIndex] = provider
      if (!page) continue
      const nextCursor = page.cursor
      const seenCursors = new Set(provider.seenCursors ?? [])
      provider.done = !nextCursor || seenCursors.has(nextCursor)
      provider.cursor = provider.done ? undefined : nextCursor
      if (nextCursor) seenCursors.add(nextCursor)
      provider.seenCursors = [...seenCursors]
      const labels = page.items.filter(
        (item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent' && item.sourceDid === provider.did,
      )
      const unavailableItems = page.items.filter((item): item is UnavailableItem => item.kind === 'unavailable')
      return {
        items: [...this.hydrateSources(labels, signal), ...unavailableItems].sort(
          (left, right) =>
            timestampFor(right.kind === 'unavailable' ? undefined : right.createdAt) -
            timestampFor(left.kind === 'unavailable' ? undefined : left.createdAt),
        ),
        cursor: state.providers.some((candidate) => !candidate.done) ? snapshotLabelState(state) : undefined,
      }
    }
  }

  private async loadAppViewPage({
    did,
    cursor,
    providers,
    sources,
    signal,
  }: {
    did: string
    cursor?: string
    sources: string[]
    providers: ProviderPagingState[]
    signal?: AbortSignal
  }) {
    const page = await this.core.labelRecords({
      service: SERVICE_URLS.blueskyAppView,
      sources,
      uriPatterns: [did],
      cursor,
      repeatedCursorPolicy: 'return-page',
      limit: LABEL_PAGE_SIZE,
      signal,
    })
    const labels = page.items.filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
    for (const label of labels) {
      const provider = providers.find((candidate) => candidate.did === label.sourceDid)
      if (provider) {
        if (!provider.latestEventAt || timestampFor(label.createdAt) > timestampFor(provider.latestEventAt)) {
          provider.latestEventAt = label.createdAt
        }
      } else providers.push({ did: label.sourceDid, done: false, latestEventAt: label.createdAt })
    }
    providers.sort((left, right) => timestampFor(right.latestEventAt) - timestampFor(left.latestEventAt))
    return page
  }

  async labelsForSubjects(subjects: string[], signal?: AbortSignal): Promise<LabelEvent[]> {
    // labelers.firehose.stream processed only the first repeated uriPatterns
    // value when verified on 2026-09-02. Send one subject per request or later
    // labeled posts disappear from the result.
    const pages = await Promise.all(
      [...new Set(subjects)].map(async (subject) => {
        const items: Array<Omit<LabelEvent, 'source'> | UnavailableItem> = []
        const seenCursors = new Set<string>()
        let cursor: string | undefined
        do {
          throwIfAborted(signal)
          const page = await this.core.labelRecords({ uriPatterns: [subject], cursor, limit: LABEL_PAGE_SIZE, signal })
          items.push(...page.items)
          cursor = page.cursor
          if (cursor && seenCursors.has(cursor))
            throw new PublicDataValidationError('The label service repeated a pagination cursor.')
          if (cursor) seenCursors.add(cursor)
        } while (cursor)
        return items
      }),
    )
    const labels = pages.flat().filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
    return this.hydrateSources(labels, signal)
  }

  private hydrateSources(labels: Omit<LabelEvent, 'source'>[], signal?: AbortSignal): LabelEvent[] {
    const uniqueLabels = dedupeBy(labels, (label) => label.id)
    throwIfAborted(signal)
    return uniqueLabels.map((label) => ({ ...label, source: actorReference(label.sourceDid) }))
  }
}
