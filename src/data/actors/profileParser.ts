import { AppBskyActorProfile } from '@atcute/bluesky'
import { ComAtprotoLabelDefs } from '@atcute/atproto'
import * as v from '@atcute/lexicons/validations'
import type { ActorIdentity, ActorProfile, RawRecord } from '../../types'
import { blobCid, parsedRecord, stringValue } from '../recordValues'

const NO_UNAUTHENTICATED_SELF_LABEL = '!no-unauthenticated'

export function profileFromRecord(identity: ActorIdentity, record?: RawRecord): ActorProfile {
  const value = parsedRecord(AppBskyActorProfile.mainSchema, record)
  const labels = v.safeParse(ComAtprotoLabelDefs.selfLabelsSchema, record?.value.labels)
  return {
    kind: 'actorProfile',
    identity,
    hasNoUnauthenticatedSelfLabel:
      labels.ok && labels.value.values.some((label) => label.val === NO_UNAUTHENTICATED_SELF_LABEL),
    displayName: stringValue(value?.displayName),
    pronouns: stringValue(value?.pronouns),
    description: stringValue(value?.description),
    avatarCid: blobCid(value?.avatar),
  }
}
