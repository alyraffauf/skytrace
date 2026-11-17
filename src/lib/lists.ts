const MODERATION_LIST_PURPOSE = 'app.bsky.graph.defs#modlist'

/**
 * Only the canonical purpose is a moderation list. Suffix matches would let custom purposes claim
 * the Moderation label without being subject to its visibility rules.
 */
export function isModerationListPurpose(purpose: string): boolean {
  return purpose === MODERATION_LIST_PURPOSE
}

export function listPurposeLabel(purpose: string): string {
  if (isModerationListPurpose(purpose)) return 'Moderation'
  if (purpose.endsWith('#curatelist')) return 'Curation'
  if (purpose.endsWith('#referencelist')) return 'Starter pack'
  return purpose.split('#').at(-1) || 'List'
}
