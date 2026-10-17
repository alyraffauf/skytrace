import { throwIfAborted } from '../../lib/abort'
import { dedupeBy } from '../../lib/collections'
import type { LabelEvent } from '../../types'
import { actorReference } from '../recordResults'

export function hydrateLabelSources(labels: Omit<LabelEvent, 'source'>[], signal?: AbortSignal): LabelEvent[] {
  const uniqueLabels = dedupeBy(labels, (label) => label.id)
  throwIfAborted(signal)
  return uniqueLabels.map((label) => ({ ...label, source: actorReference(label.sourceDid) }))
}
