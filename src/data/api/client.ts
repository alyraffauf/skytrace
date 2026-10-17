import { Client, simpleFetchHandler } from '@atcute/client'
import { SERVICE_URLS } from '../../config/serviceUrls'

const MAX_CLIENTS = 32
const clients = new Map<string, Client>()

export function clientFor(service: string): Client {
  let client = clients.get(service)
  if (client) {
    clients.delete(service)
    clients.set(service, client)
    return client
  }

  client = new Client({
    handler: simpleFetchHandler({
      service,
      fetch: (input, init) => {
        if (service !== SERVICE_URLS.typeahead) return fetch(input, init)
        const headers = new Headers(init?.headers)
        headers.set('X-Client', 'skytrace')
        return fetch(input, { ...init, headers })
      },
    }),
  })
  clients.set(service, client)
  if (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value!)
  return client
}
