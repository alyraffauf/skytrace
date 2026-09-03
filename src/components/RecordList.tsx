import type { ReactNode } from 'react'

export const compactRowClassName = 'min-h-16 py-3'

export function RecordList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-zinc-200 border-b border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {children}
    </div>
  )
}

export function UnavailableRow({ reason }: { reason: string }) {
  return (
    <div className={`${compactRowClassName} flex items-center text-sm text-zinc-600 dark:text-zinc-400`}>{reason}</div>
  )
}
