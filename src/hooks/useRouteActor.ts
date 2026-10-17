import { useLocation } from 'react-router-dom'

export function useRouteActor(): string {
  const { pathname } = useLocation()
  const actor = pathname.split('/')[2] ?? ''
  try {
    // React Router turns a DID's literal %2F into a slash in useParams. Decode the raw segment once instead.
    return decodeURIComponent(actor)
  } catch {
    return actor
  }
}
