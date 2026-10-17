import { useEffect, useState } from 'react'

export function useDelayedFlag(active: boolean): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(active), active ? 350 : 500)
    return () => window.clearTimeout(timeout)
  }, [active])
  return visible
}
