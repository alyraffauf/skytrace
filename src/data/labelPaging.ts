type ProviderPagingState = {
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
  kind: 'labels'
  did: string
  uriPatterns: string[]
  relayCursor?: string
  relayDone: boolean
  providers: ProviderPagingState[]
  emittedIds: string[]
}

export function readLabelState(did: string, uriPatterns: string[], cursor?: LabelPagingState): LabelPagingState {
  const normalizedPatterns = [...new Set(uriPatterns)].sort()
  if (!cursor)
    return { kind: 'labels', did, uriPatterns: normalizedPatterns, relayDone: false, providers: [], emittedIds: [] }
  const patternsMatch =
    cursor.uriPatterns.length === normalizedPatterns.length &&
    cursor.uriPatterns.every((pattern, index) => pattern === normalizedPatterns[index])
  if (cursor.did !== did || !patternsMatch) throw new Error('This label cursor belongs to another query.')
  return {
    ...cursor,
    uriPatterns: [...cursor.uriPatterns],
    providers: cursor.providers.map((provider) => ({
      ...provider,
      seenCursors: provider.seenCursors ? [...provider.seenCursors] : undefined,
    })),
    emittedIds: [...cursor.emittedIds],
  }
}

export function storeLabelState(state: LabelPagingState): LabelPagingState {
  return readLabelState(state.did, state.uriPatterns, state)
}
