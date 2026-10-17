import type { LabelEvent, Page, RawRecord, RepositoryRecord, UnavailableItem } from '../types'
import { throwIfAborted } from '../lib/abort'
import { CACHE_TTL_MS } from './runtime/cachePolicy'
import { getBacklinks } from './api/backlinks'
import { getRecordByUri, listRecords } from './api/repository'
import { queryLabels } from './api/labels'
import { queryKeys } from './queryKeys'
import type { SharedQueryRequests } from './runtime/sharedQueryRequests'
import { PublicDataValidationError } from './validationError'

export class PublicDataCore {
  constructor(private readonly sharedRequests: SharedQueryRequests) {}

  async record(uri: string, signal?: AbortSignal): Promise<RawRecord> {
    return this.sharedRequests.query({
      queryKey: queryKeys.record(uri),
      staleTime: CACHE_TTL_MS.record,
      load: (requestSignal) => getRecordByUri(uri, requestSignal),
      consumerSignal: signal,
    })
  }

  async optionalRecord(uri: string, signal?: AbortSignal): Promise<RawRecord | undefined> {
    try {
      const result = await this.record(uri, signal)
      throwIfAborted(signal)
      return result
    } catch {
      throwIfAborted(signal)
      return undefined
    }
  }

  async repositoryRecords(options: Parameters<typeof listRecords>[0]): Promise<Page<RepositoryRecord>> {
    return this.cachedPage({
      key: queryKeys.repositoryRecords(options),
      cursor: options.cursor,
      signal: options.signal,
      load: (signal) => listRecords({ ...options, signal }),
      repeatedCursorError: 'The PDS repeated a pagination cursor.',
    })
  }

  async backlinks(options: Parameters<typeof getBacklinks>[0]): Promise<Page<{ uri: string }>> {
    return this.cachedPage({
      key: queryKeys.backlinks(options),
      cursor: options.cursor,
      signal: options.signal,
      load: (signal) => getBacklinks({ ...options, signal }),
      repeatedCursorError: 'Constellation repeated a pagination cursor.',
    })
  }

  async labelRecords(
    options: Parameters<typeof queryLabels>[0] & { repeatedCursorPolicy?: 'return-page' },
  ): Promise<Page<LabelEvent | UnavailableItem>> {
    return this.cachedPage({
      key: queryKeys.labels(options),
      cursor: options.cursor,
      signal: options.signal,
      load: (signal) => queryLabels({ ...options, signal }),
      repeatedCursorError: 'The label service repeated a pagination cursor.',
      repeatedCursorPolicy: options.repeatedCursorPolicy,
    })
  }

  private async cachedPage<T>(options: {
    key: readonly unknown[]
    cursor?: string
    signal?: AbortSignal
    load: (signal: AbortSignal) => Promise<Page<T>>
    repeatedCursorPolicy?: 'return-page'
    repeatedCursorError: string
  }): Promise<Page<T>> {
    const page = await this.sharedRequests.query({
      queryKey: options.key,
      staleTime: CACHE_TTL_MS.activity,
      load: options.load,
      consumerSignal: options.signal,
    })
    throwIfAborted(options.signal)
    if (options.repeatedCursorPolicy !== 'return-page' && options.cursor && page.cursor === options.cursor) {
      throw new PublicDataValidationError(options.repeatedCursorError)
    }
    return page
  }
}
