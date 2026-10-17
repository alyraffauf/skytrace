import { Client, simpleFetchHandler } from '@atcute/client'

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
      fetch: (input, init) => fetch(input, init),
    }),
  })
  clients.set(service, client)
  if (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value!)
  return client
}
