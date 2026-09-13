import { useEffect, useState } from 'react'

export function useDelayedFlag(active: boolean, showDelayMs = 350, hideDelayMs = 500): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(active), active ? showDelayMs : hideDelayMs)
    return () => window.clearTimeout(timeout)
  }, [active, hideDelayMs, showDelayMs])
  return visible
}
