import { RecordLinksMenu } from '../records/RecordLinksMenu'
import type { UnavailableItem } from '../../types'

export function UnavailableFeedItem({ item }: { item: UnavailableItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm text-ui-muted">
      <span>{item.reason}</span>
      <RecordLinksMenu recordUri={item.id} label="unavailable record" />
    </div>
  )
}
