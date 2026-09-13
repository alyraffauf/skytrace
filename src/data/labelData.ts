import type { LabelEvent, Page, UnavailableItem } from '../types'
import { SERVICE_URLS } from '../config/serviceUrls'
import { deadlineSignal, throwIfAborted } from '../lib/abort'
import { dedupeBy } from '../lib/collections'
import { timestampFor } from '../lib/sorting'
import { readLabelState, storeLabelState, type LabelPagingState, type ProviderPagingState } from './labelPaging'
import { actorReference, type PublicDataCore } from './publicDataCore'

const LABEL_PAGE_SIZE = 250
const OPTIONAL_LABELER_TIMEOUT_MS = 2_500

export class LabelDataService {
  constructor(private readonly core: PublicDataCore) {}

  async labels(
    did: string,
    cursor?: LabelPagingState,
    signal?: AbortSignal,
  ): Promise<Page<LabelEvent | UnavailableItem, LabelPagingState>> {
    return this.aggregateLabels({ did, uriPatterns: [did], cursor, signal })
  }

  private async aggregateLabels(options: {
    did: string
    uriPatterns: string[]
    cursor?: LabelPagingState
    signal?: AbortSignal
  }): Promise<Page<LabelEvent | UnavailableItem, LabelPagingState>> {
    const { did, uriPatterns, cursor, signal } = options
    const state = readLabelState(did, uriPatterns, cursor)
    const emittedIds = new Set(state.emittedIds)

    if (!state.relayDone) {
      const page = await this.loadRelayPage({
        uriPatterns,
        cursor: state.relayCursor,
        providers: state.providers,
        signal,
      })
      const labels = page.items.filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
      state.relayDone = !page.cursor || state.seenRelayCursors.includes(page.cursor)
      state.relayCursor = state.relayDone ? undefined : page.cursor
      if (page.cursor) state.seenRelayCursors.push(page.cursor)
      const newLabels = labels.filter((label) => !emittedIds.has(label.id))
      for (const label of newLabels) emittedIds.add(label.id)
      state.emittedIds = [...emittedIds]
      const unavailableItems = page.items.filter((item): item is UnavailableItem => item.kind === 'unavailable')
      return {
        items: [...this.hydrateSources(newLabels, signal), ...unavailableItems].sort(
          (left, right) =>
            timestampFor(right.kind === 'unavailable' ? undefined : right.createdAt) -
            timestampFor(left.kind === 'unavailable' ? undefined : left.createdAt),
        ),
        cursor: !state.relayDone || state.providers.length > 0 ? storeLabelState(state) : undefined,
      }
    }

    while (true) {
      const provider = state.providers.find((candidate) => !candidate.done && !candidate.failed)
      if (!provider) {
        const failedProviders = state.providers.filter((candidate) => candidate.failed)
        if (failedProviders.length === 0) return { items: [] }
        for (const failedProvider of failedProviders) failedProvider.failed = false
        return {
          items: [],
          cursor: storeLabelState(state),
          issues: failedProviders.map((failedProvider) => failedProvider.did),
        }
      }
      const page = await this.loadProviderPage({ provider, uriPatterns, signal })
      if (!page) continue
      const nextCursor = page.cursor
      const seenCursors = new Set(provider.seenCursors ?? [])
      provider.done = !nextCursor || seenCursors.has(nextCursor)
      provider.cursor = provider.done ? undefined : nextCursor
      if (nextCursor) seenCursors.add(nextCursor)
      provider.seenCursors = [...seenCursors]
      const labels = page.items.filter(
        (item): item is Omit<LabelEvent, 'source'> =>
          item.kind === 'labelEvent' && item.sourceDid === provider.did && !emittedIds.has(item.id),
      )
      for (const label of labels) emittedIds.add(label.id)
      state.emittedIds = [...emittedIds]
      return {
        items: this.hydrateSources(labels, signal).sort(
          (left, right) => timestampFor(right.createdAt) - timestampFor(left.createdAt),
        ),
        cursor: state.providers.some((candidate) => !candidate.done) ? storeLabelState(state) : undefined,
      }
    }
  }

  private async loadRelayPage({
    uriPatterns,
    cursor,
    providers,
    signal,
  }: {
    uriPatterns: string[]
    cursor?: string
    providers: ProviderPagingState[]
    signal?: AbortSignal
  }) {
    const page = await this.core.labelRecords({
      uriPatterns,
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

  private async loadProviderPage({
    provider,
    uriPatterns,
    signal,
  }: {
    provider: ProviderPagingState
    uriPatterns: string[]
    signal?: AbortSignal
  }) {
    while (true) {
      try {
        if (!provider.useAppView && !provider.service) {
          try {
            provider.service = await this.core.labelerEndpoint(
              provider.did,
              deadlineSignal(signal, OPTIONAL_LABELER_TIMEOUT_MS),
            )
          } catch {
            throwIfAborted(signal)
            provider.useAppView = true
          }
        }
        if (!provider.service || provider.service === SERVICE_URLS.labelRelay) provider.useAppView = true

        let page: Awaited<ReturnType<PublicDataCore['labelRecords']>>
        try {
          page = await this.core.labelRecords({
            service: provider.useAppView ? SERVICE_URLS.blueskyAppView : provider.service,
            sources: provider.useAppView ? [provider.did] : undefined,
            uriPatterns,
            cursor: provider.cursor,
            limit: LABEL_PAGE_SIZE,
            signal: deadlineSignal(signal, OPTIONAL_LABELER_TIMEOUT_MS),
          })
        } catch {
          throwIfAborted(signal)
          if (provider.useAppView) throw new Error('The label provider and AppView fallback are unavailable.')
          provider.useAppView = true
          provider.cursor = undefined
          provider.seenCursors = undefined
          continue
        }
        return page
      } catch {
        throwIfAborted(signal)
        provider.failed = true
        return undefined
      }
    }
  }

  async labelsForSubjects(subjects: string[], signal?: AbortSignal): Promise<LabelEvent[]> {
    // labelers.firehose.stream processed only the first repeated uriPatterns
    // value when verified on 2026-09-02. Send one subject per request or later
    // labeled posts disappear from the result.
    const pages = await Promise.all(
      subjects.map((subject) => this.core.labelRecords({ uriPatterns: [subject], limit: LABEL_PAGE_SIZE, signal })),
    )
    const labels = pages
      .flatMap((page) => page.items)
      .filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
    return this.hydrateSources(labels, signal)
  }

  private hydrateSources(labels: Omit<LabelEvent, 'source'>[], signal?: AbortSignal): LabelEvent[] {
    const uniqueLabels = dedupeBy(labels, (label) => label.id)
    throwIfAborted(signal)
    return uniqueLabels.map((label) => ({ ...label, source: actorReference(label.sourceDid) }))
  }
}
