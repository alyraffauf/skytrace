# Pagination property audit

Production revision: `ddc8eb0fc57ccafcc1ecfa212fedf4449170e8b1`.
Discovery branch: `t3/paging-property-audit`. No production changes, published branches, or PRs.

## Commands

```sh
bun install --frozen-lockfile
bun run test tests/properties/paging --disableConsoleIntercept
PAGING_CASES=3000 bun run test tests/properties/paging --disableConsoleIntercept --testTimeout=60000
bun run typecheck
bunx oxlint --deny-warnings tests/properties/paging*.ts
bunx prettier --check tests/properties/paging*.ts
bun run test tests/feed-paging.test.ts tests/post-merging.test.ts tests/verified-backlinks.test.ts tests/pagination.test.tsx tests/labeled-post-data.test.ts tests/labeled-post-pagination.test.tsx
```

The default is 300 independently seeded cases per test. The extended run uses 3,000 seeds per test and two hook walks per seed. All five tests pass. The six existing test files pass all 53 tests. Type checking, targeted lint, and formatting pass.

The first extended run exceeded Vitest's default five-second timeout in the feed test. The explicit 60-second limit resolves this test-runner limit.

## Models and observed events

- Cursor history compares append, fork, and membership histories against arrays. Extended coverage includes 199,767 appends, 100,233 forks, 246,882 hits, and 53,118 misses.
- Feed pagination compares drained pages against an independent full-input sort of both sources. It checks saved-cursor immutability and replay. Generated source chunks vary independently and include reversed within-page order and empty pages. Extended coverage includes 5,065 generated empty pages, 30,895 source requests, 3,477 replays, and 145,725 output items.
- Feed merging compares overlapping batches against first-occurrence selection and full-input timestamp sorting. The extended run includes 81,639 duplicate inputs.
- Backlink verification compares outputs against the union of independently classified valid catalog entries. Both block and listblock collections include wrong subjects, wrong collections, repeated records, repeated publishers, empty pages, and cursor cycles. Extended coverage includes 14,966 page requests, 52,643 repeated references, 20,591 valid and 62,246 invalid candidate occurrences, and 600 cycles.
- Labeled-post pagination compares the complete output against the source records with labels. It checks label grouping, descending label dates, empty and unlabeled page progress, and cursor replay. Extended coverage includes 2,077 empty-page requests, 22,075 unlabeled records, 67,028 labeled records, 11,883 replays, and 26,766 source requests.
- Hook callbacks compare requested cursor sequences against explicit finite or cyclic paths. Extended coverage includes 4,000 rejected cyclic walks, 2,000 completed walks, 66,000 loader requests, 3,000 empty-string cursor requests, and 4,000 rejected retries. Each seed starts two independent histories with the same tokens.

Request counters include replay. Candidate counters include repeated occurrences. Assertions require every reported event class to occur. Initial coverage inspection exposed similar source sizes for adjacent LCG seeds, so the retained generator uses mixed seeds.

## Calibration

Two temporary production edits were applied individually, tested, and restored with `finally` blocks:

- Reverse the feed selection comparison from `>=` to `<=` in `feedData.ts`. The generated feed oracle fails at seed 1 with 67 incorrectly ordered items.
- Remove the publisher membership condition at emission in `verifiedBacklinks.ts`. The generated backlink oracle fails at seed 3 with a duplicate publisher.

The same suites pass after restoration. `git diff --exit-code -- src` confirms no deliberate defect remains. No confirmed production bug was found, so there is no regression or fix commit.

## Ambiguities and blind spots

The feed ordering oracle assumes each source's pages are globally descending by `createdAt`. Repository traversal is ordered by record key, which may differ from a record's declared date. The test does not establish global chronological ordering for arbitrary imported or backdated records. This is a contract question rather than a confirmed violation in this pass.

Feed generators insert at most one consecutive empty page. Ordering across exhaustion of the four-empty-page budget is untested. Source records are unique; overlapping feed responses are tested at `mergeFeedItems`, not as a repository transport consistency contract. Merge duplicates carry identical payloads, so replacement policy is left to the existing explicit tests.

The hook test captures the real query callbacks through a mocked `useInfiniteQuery`; it uses React rendering for compiler compatibility. Observer scheduling, refetch, cache eviction, and changing query keys rely on existing integration tests. Object cursors are exercised through feed and labeled-post services, not through the generic hook.

Backlink models use two publishers and fixed verification responses. They do not model concurrent mutation, missing records, transport errors, cancellation, DID filtering, or scheduler internals. Existing verification tests cover several of those cases. Labeled-post models use stable label responses and valid posts, and do not inspect label-history state internals. `mergeLabeledPosts` has existing example tests but no new randomized model here.

The seeded equivalent has no automatic shrinking or persisted failing corpus. Failure messages retain the case seed, and backlink failures include generated page references. Reproduction depends on retaining this generator revision. No real network service was contacted by the test suite.
