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

export function useLabelDisplayNames(
  labels: readonly LabelEvent[],
  service: PublicDataService,
): ReadonlyMap<string, string> {
  const sourceDids = [...new Set(labels.map((label) => label.sourceDid))]
  const definitionQueries = useQueries({
    queries: sourceDids.map((did) => service.labelDefinitionsQueryOptions(did)),
  })
  const definitionsBySource = new Map(sourceDids.map((did, index) => [did, definitionQueries[index]?.data] as const))

  return new Map(
    labels.flatMap((label) => {
      const name = labelDisplayName(label.value, definitionsBySource.get(label.sourceDid))
      return name ? [[label.id, name] as const] : []
    }),
  )
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
