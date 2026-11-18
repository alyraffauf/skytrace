# Runtime audit

Production base: `ddc8eb0fc57ccafcc1ecfa212fedf4449170e8b1`.

The shared-query model found inconsistent cancellation at seed 2. Pre-aborted consumers with string reasons threw a generic AbortError synchronously, while cancellation during a read rejected with the string. Explicit null reasons were replaced at both points. The standalone regression fails in all three cases against the base revision and passes with the minimal fix in https://github.com/alyraffauf/skytrace/pull/1.

The fix is merged into this discovery branch. The regression lives outside the discovery suite in `tests/shared-request-cancellation.test.ts`.

## Reproduction

```sh
RUNTIME_SEED=2 RUNTIME_CASES=1 bun run test tests/properties/runtimeShared.test.ts
RUNTIME_SEED=1001 RUNTIME_CASES=300 RUNTIME_COVERAGE=1 bun run test tests/properties/runtime --silent=false --reporter verbose
RUNTIME_SEED=1001 RUNTIME_CASES=300 bun run check
```

The consolidated branch passed the final command with 370 tests, lint, formatting, typechecking, and the production build. The 300-seed runtime run covers 1,200 histories across four models. The worker observed 7,216 scheduler enqueues, 1,554 queued cancellations, and 1,726 operation failures. Shared-query histories covered 2,870 joins, 3,057 fresh-cache hits, 383 refreshes exactly at TTL, and 1,343 last-reader cancellations. Late settlement checks included 816 successes and 404 failures from abandoned loads. Lifetime checks covered 145 independent readers surviving scan stops, 114 timeouts followed by retries, 208 evictions, and 92 retained entries.

The scheduler model detected a temporary newest-first dispatch mutation at seed 1 after 16 events. The mutation was reverted before validation. The generators use deterministic seeds without automatic shrinking. Retain this revision to reproduce seed traces.

## Follow-up leads and limits

- Race handle and DID reads across identity changes to check alias-cache writes. The current model uses one cache key per load.
- Explore cancellation between scheduler admission and callback execution. Admitted operations currently observe their own signals.
- Generate mixed mounted and imperative observers with different deadline policies. Current generated deadline checks use matching imperative policies and cooperative loaders.
- Loaders ignoring abort and browser timer ordering remain unverified.

Label and pagination models have separate audit reports in this directory. Those investigations found no confirmed bugs. All results concern generated inputs and mocked service boundaries, not exhaustive correctness or live network behavior.
