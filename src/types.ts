import type { CanonicalResourceUri, Cid, Did, GenericUri, Handle } from '@atcute/lexicons/syntax'

export type ActorIdentity = {
  kind: 'actorIdentity'
  did: Did
  handle: Handle
  pds: GenericUri
}

export type ActorSuggestion = {
  did: Did
  handle: Handle
  displayName?: string
  avatar?: GenericUri
}

export type AccountDetails = {
  createdAt?: string
  aliases: string[]
  formerHandles: string[]
}

export type ActorProfile = {
  kind: 'actorProfile'
  identity: ActorIdentity
  displayName?: string
  description?: string
  avatarCid?: Cid
}

export type ActorReference = {
  kind: 'actorReference'
  did: Did
}

export type Actor = ActorProfile | ActorReference | UnavailableItem

export type UnavailableItem = {
  kind: 'unavailable'
  id: string
  reason: string
}

export type RelationshipEntry = {
  kind: 'relationship'
  id: string
  actor: ActorProfile | ActorReference
  createdAt?: string
}

export type ListSummary = {
  kind: 'list'
  uri: string
  name: string
  description?: string
  purpose: string
  avatarCid?: Cid
  createdAt?: string
  owner: Actor
}

export type ListMembership = {
  kind: 'membership'
  uri: string
  createdAt?: string
  list: ListSummary | UnavailableItem
}

export type LabelEvent = {
  kind: 'labelEvent'
  id: string
  source: Actor
  sourceDid: Did
  subject: GenericUri
  value: string
  createdAt: string
  expiresAt?: string
  negated: boolean
}

export type LabelValueDefinition = {
  identifier: string
  locales: Array<{
    lang: string
    name: string
    description: string
  }>
}

export type LabeledPost = {
  kind: 'labeledPost'
  uri: CanonicalResourceUri
  post: FeedPost | UnavailableItem
  labels: LabelEvent[]
}

export type Facet = {
  byteStart: number
  byteEnd: number
  href?: string
  mentionDid?: Did
  tag?: string
}

export type FeedImage = { cid: Cid; alt: string }

export type FeedPost = {
  kind: 'post'
  uri: CanonicalResourceUri
  author: Actor
  repository?: ActorIdentity
  createdAt: string
  text: string
  facets: Facet[]
  replyTo?: CanonicalResourceUri
  images?: FeedImage[]
  quote?: FeedPost | UnavailableItem
  video?: { cid: Cid; alt?: string; mimeType?: string }
}

type FeedRepost = {
  kind: 'repost'
  uri: CanonicalResourceUri
  createdAt: string
  author: Actor
  target: FeedPost | UnavailableItem
}

export type FeedItem = FeedPost | FeedRepost | UnavailableItem

export type SourceIssue = {
  source: string
}

export type Page<T, TCursor = string> = {
  items: T[]
  cursor?: TCursor
  issues?: SourceIssue[]
}

export type RawRecord = {
  uri: CanonicalResourceUri
  cid: Cid
  value: Record<string, unknown>
}

export type RepositoryRecord = RawRecord | UnavailableItem
