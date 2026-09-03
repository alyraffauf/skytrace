export function listPurposeLabel(purpose: string): string {
  if (purpose.endsWith('#modlist')) return 'Moderation'
  if (purpose.endsWith('#curatelist')) return 'Curation'
  if (purpose.endsWith('#referencelist')) return 'Starter pack'
  return purpose.split('#').at(-1) || 'List'
}
