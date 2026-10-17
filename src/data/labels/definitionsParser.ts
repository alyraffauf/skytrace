import { AppBskyLabelerService } from '@atcute/bluesky'
import type { LabelValueDefinition, RawRecord } from '../../types'
import { parsedRecord } from '../recordValues'

export function labelDefinitionsFromRecord(record?: RawRecord): LabelValueDefinition[] {
  const value = parsedRecord(AppBskyLabelerService.mainSchema, record)
  return (value?.policies.labelValueDefinitions ?? []).map((definition) => ({
    identifier: definition.identifier,
    locales: definition.locales.map((locale) => ({
      lang: locale.lang,
      name: locale.name,
    })),
  }))
}
