import { EmptyState } from '../ui/States'

export function UnavailablePostsNotice() {
  return (
    <EmptyState className="mt-8 border-none py-12 sm:mt-12" title="Posts aren't available here">
      This account has chosen not to show its posts on public sites like SkyTrace.
    </EmptyState>
  )
}
