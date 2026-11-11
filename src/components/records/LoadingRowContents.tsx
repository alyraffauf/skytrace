import { Skeleton } from '@astryxdesign/core/Skeleton'
export function LoadingRowContents() {
  return (
    <>
      <Skeleton width="2rem" height="2rem" radius="rounded" className="shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton width="9rem" height="0.875rem" />
        <Skeleton width="6rem" height="0.75rem" />
      </div>
    </>
  )
}
