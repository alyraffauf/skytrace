import type { ActorIdentity } from '../types'

export const queryKeys = {
  actorSuggestions: (query: string) => ['actorSuggestions', query] as const,
  accountDetails: (did: string) => ['accountDetails', did] as const,
  identity: (identifier: string) => ['identity', identifier] as const,
  profileView: (identifier: string) => ['actorProfileView', identifier] as const,
  record: (uri: string) => ['record', uri] as const,
  listSummary: (uri: string | undefined) => ['listSummary', uri] as const,
  repositoryRecords: (identity: ActorIdentity, collection: string, cursor: string | undefined, limit: number) =>
    ['repositoryRecords', identity.pds, identity.did, collection, cursor ?? null, limit] as const,
  backlinks: (subject: string, source: string, cursor: string | undefined) =>
    ['backlinks', subject, source, cursor ?? null] as const,
  labelerEndpoint: (did: string) => ['labelerEndpoint', did] as const,
  labelDefinitions: (did: string) => ['labelDefinitions', did] as const,
  labels: (service: string, uriPatterns: string[], sources: string[], cursor: string | undefined, limit: number) =>
    [
      'labelRecords',
      service,
      [...new Set(uriPatterns)].sort(),
      [...new Set(sources)].sort(),
      cursor ?? null,
      limit,
    ] as const,
  profileTab: (did: string, tab: string) => ['profileTab', did, tab] as const,
  labeledPosts: (did: string) => ['labeledPosts', did] as const,
  feed: (did: string) => ['feed', did] as const,
  listMembers: (uri: string) => ['listMembers', uri] as const,
} as const
