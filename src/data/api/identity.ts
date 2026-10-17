import { ok } from '@atcute/client'
import type { ActorIdentifier, GenericUri } from '@atcute/lexicons/syntax'
import { isHandle } from '@atcute/lexicons/syntax'
import type {} from '@atcute/microcosm'
import type { ActorIdentity } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { isDid } from '../../lib/parse'
import { hydrationRequests } from '../../lib/requestScheduler'
import { objectValue, stringValue } from '../recordParsers'
import { PublicDataValidationError } from '../validationError'
import { clientFor } from './client'

export function validateIdentity(value: unknown): ActorIdentity {
  const data = objectValue(value)
  const did = stringValue(data?.did)
  const handle = stringValue(data?.handle)
  const pds = stringValue(data?.pds)
  if (!did || !isDid(did) || !handle || !isHandle(handle) || !pds)
    throw new PublicDataValidationError('The identity service returned an incomplete profile.')

  let pdsUrl: URL
  try {
    pdsUrl = new URL(pds)
  } catch {
    throw new PublicDataValidationError('The identity service returned an invalid PDS address.')
  }
  const isSecure = pdsUrl.protocol === 'https:'
  const isLocalDevelopment = pdsUrl.protocol === 'http:' && pdsUrl.hostname === 'localhost'
  if (!isSecure && !isLocalDevelopment)
    throw new PublicDataValidationError('The identity service returned an unsafe PDS address.')
  return { kind: 'actorIdentity', did, handle, pds: pdsUrl.origin as GenericUri }
}

export async function resolveActor(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.slingshot).get('blue.microcosm.identity.resolveMiniDoc', {
          params: { identifier: identifier as ActorIdentifier },
          signal,
        }),
      ),
    signal,
  )
  return validateIdentity(data)
}
