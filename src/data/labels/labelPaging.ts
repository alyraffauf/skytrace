import type { CursorHistory } from '../cursorHistory'

export const LABEL_PAGE_SIZE = 250

export type ProviderPagingState = {
  did: string
  service?: string
  cursor?: string
  done: boolean
  failed?: boolean
  useAppView?: boolean
  latestEventAt?: string
  cursorHistory?: CursorHistory
}

export type LabelPagingState = {
  discoveryCursor?: string
  discoveryCursorHistory?: CursorHistory
  discoveryDone?: boolean
  appViewSources?: string[]
  kind: 'labels'
  did: string
  appViewCursor?: string
  appViewCursorHistory?: CursorHistory
  appViewDone: boolean
  providers: ProviderPagingState[]
}

export function readLabelState(did: string, cursor?: LabelPagingState): LabelPagingState {
  if (!cursor)
    return {
      kind: 'labels',
      did,
      appViewDone: false,
      providers: [],
    }
  if (cursor.did !== did) throw new Error('This label cursor belongs to another query.')
  return {
    ...cursor,
    appViewSources: cursor.appViewSources ? [...cursor.appViewSources] : undefined,
    providers: cursor.providers.map((provider) => ({ ...provider })),
  }
}
