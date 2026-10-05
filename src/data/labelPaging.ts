export type ProviderPagingState = {
  did: string
  service?: string
  cursor?: string
  done: boolean
  failed?: boolean
  useAppView?: boolean
  latestEventAt?: string
  seenCursors?: string[]
}

export type LabelPagingState = {
  discoveryCursor?: string
  seenDiscoveryCursors?: string[]
  discoveryDone?: boolean
  appViewSources?: string[]
  kind: 'labels'
  did: string
  appViewCursor?: string
  seenAppViewCursors: string[]
  appViewDone: boolean
  providers: ProviderPagingState[]
  emittedIds: string[]
}

export function readLabelState(did: string, cursor?: LabelPagingState): LabelPagingState {
  if (!cursor)
    return {
      kind: 'labels',
      did,
      appViewDone: false,
      seenAppViewCursors: [],
      providers: [],
      emittedIds: [],
    }
  if (cursor.did !== did) throw new Error('This label cursor belongs to another query.')
  return {
    ...cursor,
    seenDiscoveryCursors: [...(cursor.seenDiscoveryCursors ?? [])],
    appViewSources: cursor.appViewSources ? [...cursor.appViewSources] : undefined,
    seenAppViewCursors: [...cursor.seenAppViewCursors],
    providers: cursor.providers.map((provider) => ({
      ...provider,
      seenCursors: provider.seenCursors ? [...provider.seenCursors] : undefined,
    })),
    emittedIds: [...cursor.emittedIds],
  }
}

export function storeLabelState(state: LabelPagingState): LabelPagingState {
  return readLabelState(state.did, state)
}
