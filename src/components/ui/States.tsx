import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState as AstryxEmptyState } from '@astryxdesign/core/EmptyState'
import { LoadingRowContents } from '../records/LoadingRowContents'
import { ArrowPathIcon, ExclamationTriangleIcon, InboxIcon } from '@heroicons/react/24/outline'
import { ClientResponseError } from '@atcute/client'

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div aria-label="Loading" aria-live="polite" className="divide-y divide-ui-border border-b border-ui-border">
      <span className="sr-only" role="status">
        Loading public records…
      </span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-2.5 py-2">
          <LoadingRowContents />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: string
  action?: React.ReactNode
}) {
  return (
    <AstryxEmptyState
      title={title}
      headingLevel={2}
      icon={<InboxIcon className="size-6" />}
      actions={action}
      description={children}
    />
  )
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Banner
      role="alert"
      status="error"
      container="section"
      title={<h2>Couldn&apos;t load</h2>}
      description={readableError(error)}
      endContent={
        retry ? (
          <Button label="Retry" variant="secondary" onClick={retry} icon={<ArrowPathIcon className="size-4" />} />
        ) : undefined
      }
    />
  )
}

function readableError(error: Error): string {
  if (!(error instanceof ClientResponseError)) return error.message
  if (error.status === 404) return "We couldn't find that account or public record."
  if (error.status === 429) return 'The public service is busy. Wait a moment, then retry.'
  if (error.status >= 500) return 'A public data service is temporarily unavailable.'
  return error.description || 'The public service rejected this request.'
}

export function UnavailableCard({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 border-b border-ui-border py-2 text-sm text-ui-muted">
      <ExclamationTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
      <span>{reason}</span>
    </div>
  )
}
