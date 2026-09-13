import { useQueries } from '@tanstack/react-query'
import type { PublicDataService } from '../data/publicData'
import type { LabelEvent } from '../types'
import { labelDisplayName } from '../lib/labelNames'

export function useLabelDisplayNames(
  labels: readonly LabelEvent[],
  service: PublicDataService,
): ReadonlyMap<string, string> {
  const sourceDids = [...new Set(labels.map((label) => label.sourceDid))]
  const definitionQueries = useQueries({
    queries: sourceDids.map((did) => service.core.labelDefinitionsQueryOptions(did)),
  })
  const definitionsBySource = new Map(sourceDids.map((did, index) => [did, definitionQueries[index]?.data] as const))

  return new Map(
    labels.flatMap((label) => {
      const name = labelDisplayName(label.value, definitionsBySource.get(label.sourceDid))
      return name ? [[label.id, name] as const] : []
    }),
  )
}
