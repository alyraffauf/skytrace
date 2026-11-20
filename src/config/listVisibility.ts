export function minimumListBlocking(): number | undefined {
  const minimum = window.__SKYTRACE_CONFIG__?.minListBlocking
  return typeof minimum === 'number' && Number.isSafeInteger(minimum) && minimum >= 0 ? minimum : undefined
}

export function visibleListTypes(): readonly string[] | undefined {
  return window.__SKYTRACE_CONFIG__?.listTypes ?? undefined
}

export function isListTypeVisible(purpose: string): boolean {
  const types = visibleListTypes()
  if (types === undefined) return true
  const type = {
    'app.bsky.graph.defs#modlist': 'moderation',
    'app.bsky.graph.defs#curatelist': 'curation',
    'app.bsky.graph.defs#referencelist': 'starter-pack',
  }[purpose]
  return type !== undefined && types.includes(type)
}
