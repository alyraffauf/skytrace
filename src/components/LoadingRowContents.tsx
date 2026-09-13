export function LoadingRowContents() {
  return (
    <>
      <div className="skeleton size-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3.5 w-36" />
        <div className="skeleton h-3 w-24" />
      </div>
    </>
  )
}
