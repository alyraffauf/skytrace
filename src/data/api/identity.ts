import { ClientResponseError, ok } from '@atcute/client'
import { getPdsEndpoint, isPlcDid, isWebDid } from '@atcute/identity'
import { BlueMicrocosmIdentityResolveMiniDoc } from '@atcute/microcosm'
import type { ActorIdentifier, GenericUri } from '@atcute/lexicons/syntax'
import type { ActorIdentity } from '../../types'
import { SERVICE_URLS } from '../../config/serviceUrls'
import { hydrationRequests } from '../runtime/requestScheduler'
import { PublicDataValidationError } from '../validationError'
import { clientFor } from './client'
import { didDocumentResolver } from './didDocumentResolver'
import { throwIfAborted } from '../../lib/abort'

export async function resolveActor(identifier: string, signal?: AbortSignal): Promise<ActorIdentity> {
  const data = await hydrationRequests
    .run(
      () =>
        ok(
          clientFor(SERVICE_URLS.slingshot).call(BlueMicrocosmIdentityResolveMiniDoc, {
            params: { identifier: identifier as ActorIdentifier },
            signal,
          }),
        ),
      signal,
    )
    .catch(async (error: unknown) => {
      throwIfAborted(signal)
      if (
        !(isPlcDid(identifier) || isWebDid(identifier)) ||
        !(error instanceof ClientResponseError) ||
        error.status !== 400 ||
        error.error !== 'InvalidRequest' ||
        error.description !== "Failed to get DID doc's handle"
      )
        throw error

      const document = await hydrationRequests.run(() => didDocumentResolver.resolve(identifier, { signal }), signal)
      throwIfAborted(signal)
      if (document.id !== identifier)
        throw new PublicDataValidationError('The DID document returned a different identity.')
      const pds = getPdsEndpoint(document)
      if (!pds) throw new PublicDataValidationError('The DID document has no valid PDS address.')
      // A DID document alias alone does not establish a verified handle.
      return { did: identifier, handle: 'handle.invalid' as const, pds }
    })
  throwIfAborted(signal)
  return { kind: 'actorIdentity', did: data.did, handle: data.handle, pds: validatedPdsOrigin(data.pds) }
}

function validatedPdsOrigin(pds: string): GenericUri {
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
  return pdsUrl.origin as GenericUri
}
