export function SourceIssues({ issues, retry }: { issues: string[]; retry: () => void }) {
  const sources = new Set(issues).size
  return (
    <div
      role="status"
      className="flex min-h-11 items-center justify-between border-b border-amber-300 bg-amber-50 px-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <span>
        {sources} {sources === 1 ? 'source' : 'sources'} unavailable
      </span>
      <button
        type="button"
        onClick={retry}
        className="min-h-10 px-2 font-semibold text-violet-800 hover:underline dark:text-violet-300"
      >
        Retry
      </button>
    </div>
  )
}
