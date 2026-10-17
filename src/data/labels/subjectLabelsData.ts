import { throwIfAborted } from '../../lib/abort'
import type { LabelEvent, UnavailableItem } from '../../types'
import type { PublicDataCore } from '../publicDataCore'
import { PublicDataValidationError } from '../validationError'
import { hydrateLabelSources } from './labelEvents'
import { LABEL_PAGE_SIZE } from './labelPaging'

export class SubjectLabelsDataService {
  constructor(private readonly core: PublicDataCore) {}

  async forSubjects(subjects: string[], signal?: AbortSignal): Promise<LabelEvent[]> {
    // labelers.firehose.stream processed only the first repeated uriPatterns
    // value when verified on 2026-09-02. Send one subject per request or later
    // labeled posts disappear from the result.
    const pages = await Promise.all(
      [...new Set(subjects)].map(async (subject) => {
        const items: Array<Omit<LabelEvent, 'source'> | UnavailableItem> = []
        const seenCursors = new Set<string>()
        let cursor: string | undefined
        do {
          throwIfAborted(signal)
          const page = await this.core.labelRecords({ uriPatterns: [subject], cursor, limit: LABEL_PAGE_SIZE, signal })
          items.push(...page.items)
          cursor = page.cursor
          if (cursor && seenCursors.has(cursor))
            throw new PublicDataValidationError('The label service repeated a pagination cursor.')
          if (cursor) seenCursors.add(cursor)
        } while (cursor)
        return items
      }),
    )
    const labels = pages.flat().filter((item): item is Omit<LabelEvent, 'source'> => item.kind === 'labelEvent')
    return hydrateLabelSources(labels, signal)
  }
}
