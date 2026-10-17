import { SERVICE_URLS } from '../../config/serviceUrls'
import { newestFirst, timestampFor } from '../../lib/sorting'
import type { LabelEvent, Page, UnavailableItem } from '../../types'
import type { PublicDataCore } from '../publicDataCore'
import type { LabelerDataService } from './labelerData'
import { throwIfAborted } from '../../lib/abort'
import { dedupeBy } from '../../lib/collections'
import { LABEL_PAGE_SIZE, readLabelState, type LabelPagingState } from './labelPaging'
import { loadProviderLabelPage } from './providerLabels'
import { hasCursor } from '../cursorHistory'

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
      state.discoveryDone = !discovery.cursor || hasCursor(state.discoveryCursorHistory, discovery.cursor)
      state.discoveryCursor = state.discoveryDone ? undefined : discovery.cursor
      if (discovery.cursor && !state.discoveryDone) {
        state.discoveryCursorHistory = { cursor: discovery.cursor, previous: state.discoveryCursorHistory }
      }
      // Save discovery progress before advancing another relay page.
      if (!state.discoveryDone) return { items: [], cursor: state }
    }

    if (!state.appViewDone) {
      const page = await this.core.labelRecords({
        service: SERVICE_URLS.blueskyAppView,
        uriPatterns: [did],
        cursor: state.appViewCursor,
        sources: state.appViewSources ?? [BLUESKY_MODERATION_DID],
        repeatedCursorPolicy: 'return-page',
        limit: LABEL_PAGE_SIZE,
        signal,
      })
      throwIfAborted(signal)
      for (const label of page.items) {
        if (label.kind !== 'labelEvent') continue
        const provider = state.providers.find((candidate) => candidate.did === label.sourceDid)
        if (provider) {
          if (!provider.latestEventAt || timestampFor(label.createdAt) > timestampFor(provider.latestEventAt)) {
            provider.latestEventAt = label.createdAt
          }
        } else state.providers.push({ did: label.sourceDid, done: false, latestEventAt: label.createdAt })
      }
      state.providers.sort((left, right) => timestampFor(right.latestEventAt) - timestampFor(left.latestEventAt))
      state.appViewDone = !page.cursor || hasCursor(state.appViewCursorHistory, page.cursor)
      state.appViewCursor = state.appViewDone ? undefined : page.cursor
      if (page.cursor && !state.appViewDone) {
        state.appViewCursorHistory = { cursor: page.cursor, previous: state.appViewCursorHistory }
      }
      return {
        items: orderedHistoryItems(page.items),
        cursor: !state.appViewDone || state.providers.length > 0 ? state : undefined,
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
          cursor: state,
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
      throwIfAborted(signal)
      state.providers[providerIndex] = provider
      if (!page) continue
      const nextCursor = page.cursor
      provider.done = !nextCursor || hasCursor(provider.cursorHistory, nextCursor)
      provider.cursor = provider.done ? undefined : nextCursor
      if (nextCursor && !provider.done) {
        provider.cursorHistory = { cursor: nextCursor, previous: provider.cursorHistory }
      }
      const items = page.items.filter((item) => item.kind === 'unavailable' || item.sourceDid === provider.did)
      return {
        items: orderedHistoryItems(items),
        cursor: state.providers.some((candidate) => !candidate.done) ? state : undefined,
      }
    }
  }
}

function orderedHistoryItems(items: Array<LabelEvent | UnavailableItem>): Array<LabelEvent | UnavailableItem> {
  const labels = items.filter((item): item is LabelEvent => item.kind === 'labelEvent')
  const unavailableItems = items.filter((item): item is UnavailableItem => item.kind === 'unavailable')
  return newestFirst([...dedupeBy(labels, (label) => label.id), ...unavailableItems])
}
