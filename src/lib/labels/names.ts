import type { LabelValueDefinition } from '../../types'

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
  languages: readonly string[],
): string | undefined {
  const definition = definitions?.find((candidate) => candidate.identifier === value)
  // Label values come from third-party labelers, so only trust own properties of this table.
  if (!definition) return Object.hasOwn(BUILT_IN_LABEL_NAMES, value) ? BUILT_IN_LABEL_NAMES[value] : undefined

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
