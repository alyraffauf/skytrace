import { EmptyState } from '../ui/States'

export function UnavailablePostsNotice() {
  return (
    <EmptyState title="Posts aren't available here">
      This account has chosen not to show its posts on public sites like SkyTrace.
    </EmptyState>
  )
}
