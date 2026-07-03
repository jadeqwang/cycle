# Plan: Fix round-2 review findings (Google Calendar sync)

Fixes the findings from the review of the round-1 fix work (uncommitted working tree vs HEAD, executed against `2026-07-02-gcal-sync-review-fixes.md`). **Apply these on top of the current uncommitted tree — do not revert, stash, or reformat it.** Round-1 + round-2 changes should be committed together once this plan lands. Never read or commit `period-import.json`.

**Assignment key:** [Codex] = fully specified, mechanical — execute exactly as written. [Fable] = subtle merge semantics, needs judgment; gated on Jade's decision.

> **Status (2026-07-02, end of day): all four tasks done and verified — 51/51 tests pass, `npm run build` clean.** Tasks 1/2/4 executed by Codex as specified. Task 3 (option B) was applied by Fable; note it had to be applied *twice* — a concurrent-write collision with the Codex session silently reverted the first application (Codex wrote `CycleApp.jsx`/`CycleApp.test.js` from a pre-Task-3 read). If sessions ever share this tree again, serialize them. Tree is ready for the single round-1 + round-2 commit; Android `gradlew assembleDebug` and on-device verify remain pending on Jade.

## Task 1: Settle the sync loop — tombstone-filter reference bail-out — **[Codex]** (Critical)

**Bug:** `src/CycleApp.jsx:1058` — `setDeletedEventIds(ids => ids.filter(id => !result.clearedTombstones.includes(id)))`. `filter` always returns a **new array** (even `[].filter(...)`), React bails only on `Object.is`, so every successful sync changes the `deletedEventIds` reference → the debounced effect (`:1090-1094`, deps include `deletedEventIds`) re-fires → sync every ~5s forever. This defeats the round-1 `mergeSyncResult` prev-bail one line above it; the "non-settling loop" bug (#3) is still live.

- Extract a pure exported helper next to `mergeSyncResult` (this is the same invariant — "return the previous reference when content is unchanged"):

```js
function filterClearedTombstones(ids, clearedTombstones) {
  const next = ids.filter(id => !clearedTombstones.includes(id));
  return next.length === ids.length ? ids : next;
}
```

- Call site becomes `setDeletedEventIds(ids => filterClearedTombstones(ids, result.clearedTombstones));`. Export `filterClearedTombstones` alongside `mergeSyncResult`.
- Tests (`src/CycleApp.test.js`, TDD — write these first, watch the reference test fail against `filter`-only): (a) returns **the same reference** (`toBe`) when `clearedTombstones` is empty; (b) same reference when there is no overlap; (c) returns a filtered new array when there is overlap. Mirror the existing `mergeSyncResult` "returns the previous array" test style.
- Verify: `npx vitest run`, `npm run build`.

## Task 2: Clear retry/error timers on disconnect — **[Codex]** (Important)

**Bug:** `src/CycleApp.jsx:1070` schedules `setTimeout(doSync, delay)` with a closure that captured `connected === true`. `handleSignOut` (`:1111-1115`) never clears timers and nothing clears them when `connected` flips false, so a pending retry fires up to 5 minutes after a clean sign-out, hits the network with revoked credentials, throws `AuthRequired`, and sets `syncStatus('auth')` → the subtitle shows "Reconnect needed" after a deliberate sign-out (the `auth` check at `:70` precedes the `!connected` check).

- Add one effect after the existing unmount-cleanup effect (`:1096`) — this covers sign-out, `AuthRequired`, and any future disconnect path in one place:

```js
useEffect(() => {
  if (!connected) {
    clearSyncTimers();
    retryCount.current = 0;
  }
}, [connected, clearSyncTimers]);
```

- No new test required (component-render infra doesn't exist in this repo); state the manual reasoning in the commit message. Do not remove the unmount cleanup at `:1096`.
- Verify: `npx vitest run`, `npm run build`.

## Task 3: `updatedAt`-aware merge for mid-flight edits — **[Fable]** (Important — **Jade chose B; done 2026-07-02**)

> **Status: done (Fable).** `mergeSyncResult` now takes `snapshotByStart` (Map of serialized start → serialized snapshot entry, captured before the `await`); an entry edited mid-flight (`prev.updatedAt > snapshot.updatedAt`) keeps its local `start`/`end`/`updatedAt` and adopts the sync result's event ids so the next sync patches instead of duplicating. `doSync` call site updated. 4 `mergeSyncResult` tests green (mid-flight edit preserved; prev-reference bail intact; remote adoption intact; added-entry preservation intact). Mid-flight deletions remain deferred as stated below.

**Gap (plan-level, not an execution error):** `mergeSyncResult` (`src/CycleApp.jsx:199-207`) only protects entries **added** during an in-flight sync, exactly as the round-1 plan specified. Editing a snapshot entry mid-flight is still clobbered: open app → auto-sync starts → tap "period ended" during the multi-second flight → merge takes the pre-edit sync-result version → the end date is silently lost and the clobbered state syncs upward 5s later.

**Decision for Jade (recommend B):**
- **A. Ship as-is.** Accept the small window; the common case (logging a new period on app-open) is already protected.
- **B. Add `updatedAt`-aware merge (recommended).** For a start present in both `prev` and the sync result, if the `prev` entry's `updatedAt` is newer than the snapshot version's, keep `prev`'s `start`/`end`/`updatedAt` and adopt the result's `startEventId`/`endEventId`. Requires changing the second param from a `Set` of starts to a `Map` of start → snapshot-serialized entry (update the `doSync` call site at `:1049-1057`). Tests: mid-flight `setPeriodEnd` preserved; mid-flight no-op still returns `prev` by reference; remote-newer change still adopted.

**Explicitly deferred either way:** mid-flight *deletions* resurrect (entry is in snapshot and result; `planSync` clears all tombstones unconditionally, `src/sync.js:63`). Fixing that needs deletion tracking across the await — out of scope unless Jade asks.

Depends on Task 1 (same file, same helper cluster). Verify: `npx vitest run`, `npm run build`.

## Task 4: Test timezone hygiene — **[Codex]** (Minor)

- `src/CycleApp.test.js:33-53` (`syncSubtitle` test): `lastSyncedAt` is `2026-07-02T18:00:00.000Z`, six hours **after** the fake now (`12:00Z`) — in UTC+6…+11 that lands on the next local day and `'Synced · today'` fails. Change `lastSyncedAt` to `'2026-07-02T11:00:00.000Z'`.
- `src/run-sync.test.js` tests 3–4 (`patches a remote event…`, `rejects when the second create fails…`): they rely on the default `todayStr` from fake system time, which flips date at |offset| ≥ 12. Pass `todayStr: '2026-07-02'` explicitly in both. Do **not** touch the two boundary tests — their injected `todayStr` values are the point.
- Verify: `npx vitest run`.

## Out of scope

Render-phase ref writes at `src/CycleApp.jsx:1016-1017` (`periodsRef.current = periods` in the component body): common idiom, low practical risk, not worth churn now.

## Ordering & final verification

Task 1 → Task 2 → Task 4 can run as one Codex session (1 and 2 both touch `CycleApp.jsx`, so sequential; 4 is independent but trivial). Task 3 only after Jade picks A/B; if B, Fable applies it after Tasks 1–2. Then `npx vitest run` and `npm run build`, and commit the full working tree (round-1 + round-2) together. The Android `gradlew assembleDebug` and on-device Step-4 verify remain pending on Jade.

**Assignment rationale:** Tasks 1, 2, 4 are one-to-five-line changes with exact code given — no judgment left, so they go to Codex to conserve Fable quota. Task 3 is merge-semantics design where a wrong "obvious" fix already slipped through once; it stays with Fable and is gated on Jade's scope decision.
