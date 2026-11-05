import { throwIfAborted } from '../../lib/abort'
import type { LabelEvent, UnavailableItem } from '../../types'
import type { PublicDataCore } from '../publicDataCore'
import { PublicDataValidationError } from '../validationError'
import { dedupeBy } from '../../lib/collections'
import { LABEL_PAGE_SIZE } from './labelPaging'
import { runCancellableScan } from '../runtime/scanCancellation'

export class SubjectLabelsDataService {
  constructor(private readonly core: PublicDataCore) {}

  /**
   * Returns every label event for the subjects. Label history is complete or the call fails: a later negation can undo
   * an earlier label, so a partial history could show labels that are no longer active. When any subject fails,
   * the remaining subjects stop with that failure.
   */
  async forSubjects(subjects: string[], signal?: AbortSignal): Promise<LabelEvent[]> {
    const pages = await runCancellableScan(signal, ({ signal: scanSignal, stop }) =>
      Promise.all(
        [...new Set(subjects)].map((subject) =>
          this.subjectHistory(subject, scanSignal).catch((error: unknown) => {
            stop(error)
            throw error
          }),
        ),
      ),
    )
    const labels = pages.flat().filter((item): item is LabelEvent => item.kind === 'labelEvent')
    return dedupeBy(labels, (label) => label.id)
  }

  private async subjectHistory(subject: string, signal: AbortSignal): Promise<Array<LabelEvent | UnavailableItem>> {
    // labelers.firehose.stream processed only the first repeated uriPatterns
    // value when verified on 2026-09-02. Send one subject per request or later
    // labeled posts disappear from the result.
    const items: Array<LabelEvent | UnavailableItem> = []
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    while (true) {
      throwIfAborted(signal)
      const page = await this.core.labelRecords({ uriPatterns: [subject], cursor, limit: LABEL_PAGE_SIZE, signal })
      items.push(...page.items)
      if (!page.cursor) return items
      if (seenCursors.has(page.cursor))
        throw new PublicDataValidationError('The label service repeated a pagination cursor.')
      seenCursors.add(page.cursor)
      cursor = page.cursor
    }
  }
}
