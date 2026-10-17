import { useSyncExternalStore } from 'react'
import { labelState } from '../lib/labels/history'
import type { LabelEvent } from '../types'

// Browser timers cannot wait longer than a signed 32-bit millisecond count.
const MAX_TIMEOUT_MS = 2_147_483_647

export function useLabelState(label?: LabelEvent) {
  return useSyncExternalStore(
    (onChange) => {
      if (!label?.expiresAt || label.negated) return () => {}
      const expiresAtMs = Date.parse(label.expiresAt)
      if (!Number.isFinite(expiresAtMs)) return () => {}
      let timeout: number | undefined
      function checkExpiry() {
        const remainingMs = expiresAtMs - Date.now()
        if (remainingMs <= 0) onChange()
        else timeout = window.setTimeout(checkExpiry, Math.min(remainingMs, MAX_TIMEOUT_MS))
      }
      checkExpiry()
      return () => window.clearTimeout(timeout)
    },
    () => (label ? labelState(label, Date.now()) : undefined),
  )
}
