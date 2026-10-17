import { useQueries } from '@tanstack/react-query'
import type { PublicDataService } from '../data/publicData'
import type { LabelEvent, LabelValueDefinition } from '../types'
import { labelDisplayName } from '../lib/labels/names'

export function useLabelDisplayNames(
  labels: readonly LabelEvent[],
  service: PublicDataService,
): ReadonlyMap<string, string> {
  const languages = typeof navigator === 'undefined' ? ['en'] : navigator.languages
  const sourceDids = [...new Set(labels.map((label) => label.sourceDid))]
  const definitionQueries = useQueries({
    queries: sourceDids.map((did) => service.labelers.definitionsQueryOptions(did)),
  })
  const definitionsBySource = new Map<string, LabelValueDefinition[] | undefined>()
  for (const [index, sourceDid] of sourceDids.entries()) {
    definitionsBySource.set(sourceDid, definitionQueries[index]?.data)
  }

  const displayNames = new Map<string, string>()
  for (const label of labels) {
    const name = labelDisplayName(label.value, definitionsBySource.get(label.sourceDid), languages)
    if (name) displayNames.set(label.id, name)
  }
  return displayNames
}
