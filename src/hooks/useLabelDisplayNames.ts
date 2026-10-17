import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import type { PublicDataService } from '../data/publicData'
import type { LabelEvent, LabelValueDefinition } from '../types'
import { labelDisplayName } from '../lib/labels/names'
import { usePreferredLanguages } from './usePreferredLanguages'

function collectDefinitionData(results: UseQueryResult<LabelValueDefinition[]>[]) {
  return results.map((result) => result.data)
}

function useLabelDefinitions(sourceDids: LabelEvent['sourceDid'][], service: PublicDataService) {
  return useQueries({
    queries: sourceDids.map((did) => service.labelers.definitionsQueryOptions(did)),
    combine: collectDefinitionData,
  })
}

export function useLabelDisplayNames(
  labels: readonly LabelEvent[],
  service: PublicDataService,
): ReadonlyMap<string, string> {
  const languages = usePreferredLanguages()
  const sourceDids = [...new Set(labels.map((label) => label.sourceDid))]
  const definitions = useLabelDefinitions(sourceDids, service)
  const definitionsBySource = new Map<string, LabelValueDefinition[] | undefined>()
  for (const [index, sourceDid] of sourceDids.entries()) {
    definitionsBySource.set(sourceDid, definitions[index])
  }

  const displayNames = new Map<string, string>()
  const namesBySource = new Map<string, Map<string, string | undefined>>()
  for (const label of labels) {
    let sourceNames = namesBySource.get(label.sourceDid)
    if (!sourceNames) {
      sourceNames = new Map()
      namesBySource.set(label.sourceDid, sourceNames)
    }
    if (!sourceNames.has(label.value)) {
      sourceNames.set(label.value, labelDisplayName(label.value, definitionsBySource.get(label.sourceDid), languages))
    }
    const name = sourceNames.get(label.value)
    if (name) displayNames.set(label.id, name)
  }
  return displayNames
}
