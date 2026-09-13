import { RecordLinksMenu } from '../RecordLinksMenu'
import type { UnavailableItem } from '../../types'

export function UnavailableFeedItem({ item }: { item: UnavailableItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
      <span>{item.reason}</span>
      <RecordLinksMenu recordUri={item.id} label="unavailable record" />
    </div>
  )
}
