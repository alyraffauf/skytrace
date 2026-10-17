import type { ActorIdentity, ActorProfile } from '../src/types'

export const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
export const cid = 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4'
export const identity: ActorIdentity = { kind: 'actorIdentity', did, handle: 'atproto.com', pds: 'https://pds.example' }
export const profile: ActorProfile = {
  kind: 'actorProfile',
  identity,
  hasNoUnauthenticatedSelfLabel: false,
  displayName: 'AT Protocol',
  pronouns: 'they/them',
}
export const actorReference = { kind: 'actorReference' as const, did: identity.did }
