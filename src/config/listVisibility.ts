export function minimumListBlocking(): number | undefined {
  const minimum = window.__SKYTRACE_CONFIG__?.minListBlocking
  return typeof minimum === 'number' && Number.isSafeInteger(minimum) && minimum >= 0 ? minimum : undefined
}
