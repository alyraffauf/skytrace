import type { ReactNode } from 'react'

export const compactRowClassName = 'min-h-16 py-3'

export function RecordList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-ui-border">{children}</div>
}

export function UnavailableRow({ reason }: { reason: string }) {
  return <div className={`${compactRowClassName} flex items-center text-sm text-ui-muted`}>{reason}</div>
}
