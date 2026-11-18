# Label audit, first pass

Production revision: `ddc8eb0fc57ccafcc1ecfa212fedf4449170e8b1`.
No confirmed correctness bugs. Production code is unchanged. No branches or PRs were published.

The suite uses a deterministic 32-bit LCG instead of adding a dependency. Set `LABEL_SEED` and `LABEL_CASES` to replay or expand the investigation. The RNG stream is shared across tests, so use the whole file when replaying a seed. Assertions include the seed and failing trial for history models. There is no automatic shrinking. Any future failure needs explicit reduction.

Run:

```sh
bun install --frozen-lockfile
bun run test tests/properties/labels-model.test.ts --disableConsoleIntercept
LABEL_CASES=10000 LABEL_SEED=620271 bun run test tests/properties/labels-model.test.ts --disableConsoleIntercept
bun run typecheck
bun run lint
```

The default seed is 881731 and the default case count is 1000. The larger run passed four tests with:

- 10,000 constructed interval histories: 53,745 initial applications, 80,715 renewals, 44,693 removals, 9,052 open intervals, 1,650 empty histories, and 17,866 label keys.
- 10,000 arbitrary histories across two sources, two independent subjects, and four values: 47,554 matched removals, 100,167 unmatched removals, and 6,881 same-timestamp pairs.
- 2,500 complete subject histories: 21,638 pages, 3,413 empty pages, and 16,578 duplicate deliveries. Each history also exercises a generated cursor cycle of length one through eight.
- 150 history-service cursor-cycle histories across discovery, AppView, and provider stages. Cursor snapshots remain unchanged after advancement.

The interval oracle constructs expected intervals before shuffling events. The arbitrary-history oracle uses chronological array searches to assign each removal the latest unused older application. It does not use the implementation's reverse walk, pending-removal stacks, or seen-application set. Both assert exact output, including expiry inheritance. Expiry checks include the millisecond before expiry and expiry itself. The subject pagination check compares all returned IDs with the original logical events, then checks that grouping the paged result equals grouping those events directly.

Calibration: temporarily changed `pendingRemovals.get(labelKey)?.pop()` to `.shift()`. The arbitrary-history oracle failed at trial zero with seed 881731. Reverted the mutation and verified the original production file was restored. This mutation distinguishes nearest-removal pairing from FIFO pairing. The simple interval generator alone did not catch it, which motivated retaining arbitrary consecutive removals.

Existing validation also passed seven files and 33 tests covering label history, state, subject labels, history items, provider labels, discovery, and pagination.

## Ambiguities and blind spots

- Consecutive removals currently consume separate older applications, including renewals. The suite independently checks that established pairing algorithm. Whether repeated removals should instead be idempotent at the product level is unresolved.
- Equal timestamps use the existing ID ordering. No protocol-level chronology is asserted for ties.
- `groupLabelHistory` does not promise duplicate-ID idempotence. The account view and subject service deduplicate before grouping. Duplicate delivery is tested through the subject service, not asserted directly on the grouping utility.
- Grouping individual chunks and regrouping their summaries is not promised. Chunk equivalence is tested only after complete raw-event retrieval.
- Generated service calls use fake core responses. Live endpoints, endpoint resolution, malformed wire labels, network cancellation, retries, fallback failures, and HTTP caching are outside these model checks. Existing tests cover some of them.
- Browser expiry timers, arbitrary malformed timestamps, unavailable rows, enormous histories, and provider scheduling fairness are not randomized here. Existing examples cover unavailable rows. Runtime scheduler and posts paging internals were excluded as assigned.
- Counts describe generated events, not instrumented branch coverage. Randomized sampling does not prove correctness.
