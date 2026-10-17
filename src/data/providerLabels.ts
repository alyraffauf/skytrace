import { SERVICE_URLS } from '../config/serviceUrls'
import { deadlineSignal, throwIfAborted } from '../lib/abort'
import { LABEL_PAGE_SIZE, type ProviderPagingState } from './labelPaging'
import type { PublicDataCore } from './publicDataCore'

const OPTIONAL_LABELER_TIMEOUT_MS = 2_500

type ProviderLabelPageOptions = {
  provider: Readonly<ProviderPagingState>
  did: string
  signal?: AbortSignal
  loadLabels: PublicDataCore['labelRecords']
  resolveEndpoint: (did: string, signal?: AbortSignal) => Promise<string | undefined>
}

export async function loadProviderLabelPage({
  provider: providerSnapshot,
  did,
  signal,
  loadLabels,
  resolveEndpoint,
}: ProviderLabelPageOptions) {
  const provider = {
    ...providerSnapshot,
    seenCursors: providerSnapshot.seenCursors ? [...providerSnapshot.seenCursors] : undefined,
  }
  while (true) {
    try {
      if (!provider.useAppView && !provider.service) {
        try {
          provider.service = await resolveEndpoint(provider.did, deadlineSignal(signal, OPTIONAL_LABELER_TIMEOUT_MS))
        } catch {
          throwIfAborted(signal)
          provider.useAppView = true
        }
      }
      if (!provider.service || provider.service === SERVICE_URLS.labelRelay) provider.useAppView = true

      let page: Awaited<ReturnType<PublicDataCore['labelRecords']>>
      try {
        page = await loadLabels({
          service: provider.useAppView ? SERVICE_URLS.blueskyAppView : provider.service,
          sources: provider.useAppView ? [provider.did] : undefined,
          uriPatterns: [did],
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
      return { provider, page }
    } catch {
      throwIfAborted(signal)
      provider.failed = true
      return { provider, page: undefined }
    }
  }
}
