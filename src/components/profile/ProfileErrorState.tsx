import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { RainCloud } from '../ui/RainCloud'

export function ProfileErrorState({
  actor,
  isRetrying,
  retry,
}: {
  actor: string
  isRetrying: boolean
  retry: () => void
}) {
  return (
    <div className="grid min-h-[calc(100dvh-6rem)] place-items-center px-6 py-12">
      <EmptyState
        className="max-w-md wrap-anywhere"
        headingLevel={1}
        icon={<RainCloud className="size-12 text-ui-mark" />}
        title="Account unavailable"
        description={`We couldn't load a public profile for ${actor}. Check the handle or profile URL, or try again in a moment.`}
        actions={
          <>
            <Button as={Link} href="/" label="Back to search" variant="primary" />
            <Button
              label="Try again"
              variant="secondary"
              icon={<ArrowPathIcon className="size-4" aria-hidden="true" />}
              isLoading={isRetrying}
              onClick={retry}
            />
          </>
        }
      />
    </div>
  )
}
