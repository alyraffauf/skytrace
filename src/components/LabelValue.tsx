import { useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { PublicDataService } from '../data/publicData'
import type { LabelEvent, LabelValueDefinition } from '../types'

const BUILT_IN_LABEL_NAMES: Readonly<Record<string, string>> = {
  bot: 'Bot',
  'graphic-media': 'Graphic Media',
  nudity: 'Non-sexual Nudity',
  porn: 'Adult Content',
  sexual: 'Sexually Suggestive',
}

export function labelDisplayName(
  value: string,
  definitions: readonly LabelValueDefinition[] | undefined,
  languages: readonly string[] = browserLanguages(),
): string | undefined {
  const definition = definitions?.find((candidate) => candidate.identifier === value)
  if (!definition) return BUILT_IN_LABEL_NAMES[value]

  const locales = definition.locales
  const normalizedLanguages = [...languages, 'en'].map((language) => language.toLowerCase())
  for (const language of normalizedLanguages) {
    const exact = locales.find((locale) => locale.lang.toLowerCase() === language)
    if (exact) return exact.name
    const baseLanguage = language.split('-')[0]
    const baseMatch = locales.find((locale) => locale.lang.toLowerCase().split('-')[0] === baseLanguage)
    if (baseMatch) return baseMatch.name
  }
  return locales[0]?.name
}

function browserLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? ['en'] : navigator.languages
}

type DefinitionsBySource = Map<string, LabelValueDefinition[] | undefined>

// Rows memoize on this lookup, so its identity only changes when a labeler's
// definitions change, not when new labels appear in the list.
export function useLabelDisplayNames(
  labels: readonly LabelEvent[],
  service: PublicDataService,
): (label: LabelEvent) => string | undefined {
  const sourceDids = [...new Set(labels.map((label) => label.sourceDid))]
  const definitionQueries = useQueries({
    queries: sourceDids.map((did) => service.labelDefinitionsQueryOptions(did)),
  })
  const definitionsBySource: DefinitionsBySource = new Map(
    sourceDids.map((did, index) => [did, definitionQueries[index]?.data] as const),
  )

  const definitionsRef = useRef<DefinitionsBySource | undefined>(undefined)
  const lookupRef = useRef<((label: LabelEvent) => string | undefined) | undefined>(undefined)
  if (!lookupRef.current || !definitionsRef.current || !sameDefinitions(definitionsBySource, definitionsRef.current)) {
    definitionsRef.current = definitionsBySource
    lookupRef.current = (label) => labelDisplayName(label.value, definitionsBySource.get(label.sourceDid))
  }
  return lookupRef.current
}

function sameDefinitions(current: DefinitionsBySource, previous: DefinitionsBySource): boolean {
  if (current.size !== previous.size) return false
  for (const [did, definitions] of current) {
    if (previous.get(did) !== definitions) return false
  }
  return true
}

export function LabelValue({
  value,
  displayName,
  className,
}: {
  value: string
  displayName?: string
  className?: string
}) {
  if (!displayName) return <code className={className}>{value}</code>
  return (
    <span className={className} title={`Raw label: ${value}`}>
      {displayName}
    </span>
  )
}
