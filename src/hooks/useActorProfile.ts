import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publicDataServiceFor } from '../data/publicData'

export function useActorProfile(identifier: string) {
  const service = publicDataServiceFor(useQueryClient())
  return useQuery(service.core.actorProfileQueryOptions(identifier))
}
