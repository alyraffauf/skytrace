import { abortError, throwIfAborted } from '../../lib/abort'

export type ScanScope = {
  /** Aborts when the caller cancels or `stop` is called. Its reason says which. */
  signal: AbortSignal
  /** Stops the remaining work in this scan, such as sibling requests after one fails, with the given cause. */
  stop: (cause: unknown) => void
}

/** Cancels sibling work on failure without cancelling independent consumers of shared requests. */
export async function runCancellableScan<T>(
  callerSignal: AbortSignal | undefined,
  scan: (scope: ScanScope) => Promise<T>,
): Promise<T> {
  throwIfAborted(callerSignal)
  const controller = new AbortController()
  const stop = (cause: unknown) => {
    if (!controller.signal.aborted) controller.abort(cause)
  }
  const stopForCaller = () => stop(abortError(callerSignal))
  callerSignal?.addEventListener('abort', stopForCaller, { once: true })
  try {
    const result = await scan({ signal: controller.signal, stop })
    throwIfAborted(controller.signal)
    return result
  } catch (error) {
    // Interrupted requests reject with their own errors; report why the scan stopped instead.
    throw controller.signal.aborted ? controller.signal.reason : error
  } finally {
    callerSignal?.removeEventListener('abort', stopForCaller)
  }
}
