import { Client, simpleFetchHandler } from '@atcute/client'

export function clientFor(service: string): Client {
  return new Client({ handler: simpleFetchHandler({ service }) })
}
