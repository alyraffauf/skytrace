import { SERVICE_URLS } from '../../config/serviceUrls'
import { newestFirst, timestampFor } from '../../lib/sorting'
import type { LabelEvent, Page, UnavailableItem } from '../../types'
import type { PublicDataCore } from '../publicDataCore'
import type { LabelerDataService } from './labelerData'
import { hydrateLabelSources } from './labelEvents'
import {
  LABEL_PAGE_SIZE,
  readLabelState,
  snapshotLabelState,
  type LabelPagingState,
  type ProviderPagingState,
} from './labelPaging'
import { loadProviderLabelPage } from './providerLabels'

// Include Bluesky moderation even when the relay has no events from it.
const BLUESKY_MODERATION_DID = 'did:plc:ar7c4by46qjdydhdevvrndac'

export class LabelHistoryDataService {
  constructor(
    private readonly core: PublicDataCore,
    private readonly labelers: LabelerDataService,
  ) {}

  async page(
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
      state.appViewDone = !page.cursor || state.seenAppViewCursors.includes(page.cursor)
      state.appViewCursor = state.appViewDone ? undefined : page.cursor
      if (page.cursor) state.seenAppViewCursors.push(page.cursor)
      return {
        items: hydrateHistoryItems(page.items, signal),
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
        resolveEndpoint: (sourceDid, requestSignal) => this.labelers.endpoint(sourceDid, requestSignal),
      })
      state.providers[providerIndex] = provider
      if (!page) continue
      const nextCursor = page.cursor
      const seenCursors = new Set(provider.seenCursors ?? [])
      provider.done = !nextCursor || seenCursors.has(nextCursor)
      provider.cursor = provider.done ? undefined : nextCursor
      if (nextCursor) seenCursors.add(nextCursor)
      provider.seenCursors = [...seenCursors]
      const items = page.items.filter((item) => item.kind === 'unavailable' || item.sourceDid === provider.did)
      return {
        items: hydrateHistoryItems(items, signal),
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
}

function hydrateHistoryItems(
  items: Array<Omit<LabelEvent, 'source'> | UnavailableItem>,
  signal?: AbortSignal,
): Array<LabelEvent | UnavailableItem> {
  const labels = items.filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
  const unavailableItems = items.filter((item): item is UnavailableItem => item.kind === 'unavailable')
  return newestFirst([...hydrateLabelSources(labels, signal), ...unavailableItems])
}
