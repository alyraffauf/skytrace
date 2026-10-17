export type CursorHistory = {
  readonly cursor: string
  readonly previous?: CursorHistory
}

export function hasCursor(history: CursorHistory | undefined, cursor: string): boolean {
  for (let entry = history; entry; entry = entry.previous) {
    if (entry.cursor === cursor) return true
  }
  return false
}
