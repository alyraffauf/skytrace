import { ok } from '@atcute/client'
import { BlueMicrocosmIdentityResolveMiniDoc } from '@atcute/microcosm'
import type { ActorIdentifier, GenericUri } from '@atcute/lexicons/syntax'
import type { ActorIdentity } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { hydrationRequests } from '../runtime/requestScheduler'
import { PublicDataValidationError } from '../validationError'
import { clientFor } from './client'

export async function resolveActor(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
  const data = await hydrationRequests.run(
    () =>
      ok(
        clientFor(SERVICE_URLS.slingshot).call(BlueMicrocosmIdentityResolveMiniDoc, {
          params: { identifier: identifier as ActorIdentifier },
          signal,
        }),
      ),
    signal,
  )
  let pdsUrl: URL
  try {
    pdsUrl = new URL(data.pds)
  } catch {
    throw new PublicDataValidationError('The identity service returned an invalid PDS address.')
  }
  const isSecure = pdsUrl.protocol === 'https:'
  const isLocalDevelopment = pdsUrl.protocol === 'http:' && pdsUrl.hostname === 'localhost'
  if (!isSecure && !isLocalDevelopment)
    throw new PublicDataValidationError('The identity service returned an unsafe PDS address.')
  return { kind: 'actorIdentity', did: data.did, handle: data.handle, pds: pdsUrl.origin as GenericUri }
}
