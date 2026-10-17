import type { ActorIdentity, ActorReference, RepositoryRecord, UnavailableItem } from '../types'

export function unavailable(id: string, reason = 'This public record is no longer available.'): UnavailableItem {
  return { kind: 'unavailable', id, reason }
}

export function actorReference(did: ActorIdentity['did']): ActorReference {
  return { kind: 'actorReference', did }
}

export function isUnavailableRecord(record: RepositoryRecord): record is UnavailableItem {
  return 'kind' in record && record.kind === 'unavailable'
}
