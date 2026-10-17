import { CompositeDidDocumentResolver, PlcDidDocumentResolver, WebDidDocumentResolver } from '@atcute/identity-resolver'
import { SERVICE_URLS } from '../../config/serviceUrls'

export const didDocumentResolver = new CompositeDidDocumentResolver({
  methods: {
    plc: new PlcDidDocumentResolver({
      apiUrl: SERVICE_URLS.plcDirectory,
      fetch: (input, init) => fetch(input, init),
    }),
    web: new WebDidDocumentResolver({ fetch: (input, init) => fetch(input, init) }),
  },
})
