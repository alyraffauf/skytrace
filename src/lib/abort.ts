export function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new DOMException('The request was aborted.', 'AbortError')
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal)
}

export function combinedSignal(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  if (present.length === 0) return undefined
  return AbortSignal.any(present)
}

export function deadlineSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return combinedSignal(signal, AbortSignal.timeout(timeoutMs))!
}
