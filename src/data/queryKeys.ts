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
  blockedCount: (identity?: ActorIdentity) => ['blockedCount', identity?.pds ?? null, identity?.did ?? null] as const,
  blockedByCount: (did?: string) => ['blockedByCount', did ?? null] as const,
  listBlockCount: (uri?: string) => ['listBlockCount', uri ?? null] as const,
  profileBlocked: (did?: string, targetDid?: string) => ['profileBlocked', did ?? null, targetDid ?? null] as const,
  backlinks: (subject: string, source: string, cursor: string | undefined, did?: string) =>
    ['backlinks', subject, source, cursor ?? null, did ?? null] as const,
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
  listMember: (listUri: string, membershipUri: string) => ['listMember', listUri, membershipUri] as const,
  listedOnMembership: (membershipUri: string) => ['listedOnMembership', membershipUri] as const,
  blockedByRecord: (uri: string | undefined, subjectDid: string) =>
    ['blockedByRecord', uri ?? null, subjectDid] as const,
  feedPost: (uri: string) => ['feedPost', uri] as const,
} as const
