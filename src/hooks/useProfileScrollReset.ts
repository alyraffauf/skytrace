import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

export function useProfileScrollReset() {
  const location = useLocation()
  const navigationType = useNavigationType()
  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0 })
  }, [location.pathname, location.search, navigationType])
}
