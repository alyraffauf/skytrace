import { Client, simpleFetchHandler } from '@atcute/client'

/**
 * XRPC services are pinned by origin, so following a redirect would hand requests — including
 * labeler endpoints set by third parties — to any URL they name, even a visitor's own loopback.
 */
const refuseRedirects: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error' })

export function clientFor(service: string): Client {
  return new Client({ handler: simpleFetchHandler({ service, fetch: refuseRedirects }) })
}
