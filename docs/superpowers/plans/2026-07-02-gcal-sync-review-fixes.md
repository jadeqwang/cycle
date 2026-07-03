# Plan: Fix Task 8 review findings (Google Calendar sync)

Fixes all issues from the Task 8 code review of c917cab..d9d9eb9, including nice-to-haves. Tasks 1–2 are ordered (both touch the sync path); Tasks 3–6 are independent afterward. Each task includes its own tests (TDD per repo convention). Never read or commit `period-import.json`.

**Model key:** [Opus] = subtle logic/concurrency, needs judgment. [Sonnet] = well-specified, mechanical.

## Task 1: Local-timezone `todayStr`/`timeMax` in run-sync — **[Opus]** (Critical #1)

**Bug:** `src/run-sync.js:12-14,20-25` computes `todayStr`/`timeMax` via `toISOString()` (UTC), but all app dates are local (`serializeDate`, `src/CycleApp.jsx:81-83`). West of UTC, evening syncs pull *tomorrow's projected instance* of the infinite recurring series (violates the "never pull future projections" constraint); east of UTC, an entry logged between local midnight and UTC midnight gets its remote event filtered by `pairRemoteEvents` (`src/sync.js:26`), so `planSync`'s unmatched-with-eventId branch (`src/sync.js:114-119`) **drops the local entry** — silent data loss.

- Replace `isoDate(new Date(...))` with a local-date formatter (same digit logic as `serializeDate`); compute `todayStr` = local today, `timeMax` = local tomorrow, `twoYearsAgo` = local. Prefer accepting `todayStr` as an optional `runSync` param (default: local today) so tests don't need system-time mocks; if the signature changes, update the `doSync` call in `src/CycleApp.jsx:1012`.
- Tests (`src/run-sync.test.js`): boundary cases both directions — simulate UTC-negative offset (local today < UTC today: assert a remote event dated UTC-today/local-tomorrow is **not** adopted) and UTC-positive offset (assert a local entry dated local-today with a matching remote event is **not** dropped). Keep the existing tomorrow-bound assertion.
- Verify: `npx vitest run`, `npm run build`.

## Task 2: Sync scheduler rework in CycleApp — **[Opus]** (Critical #2, Important #3/#4/#5)

Four interacting bugs in `src/CycleApp.jsx:1007-1036`; fix as one coherent change:

- **Stale-snapshot overwrite (#2):** `setPeriods(sortEntries(result.periods...))` at `:1016` clobbers entries logged during the in-flight sync (multi-second window; sync auto-runs on app open). Use a functional update that merges `result.periods` into `prev`, preserving any `prev` entry whose start date wasn't in the sync's input snapshot (capture the snapshot's serialized starts before `await`). Mirror the existing functional pattern used for `deletedEventIds` (`:1017`).
- **Non-settling loop (#3):** every success calls `setPeriods` with a fresh array → debounced effect (`:1032-1036`) re-fires → sync every ~5s forever. Skip the state update (or bail to `prev`) when serialized content is unchanged, so the effect settles.
- **Busy-skip drops requests (#5):** `doSync` returns early on `syncBusy.current`, discarding the trigger. Set a `pendingRef` when skipped and re-run in `finally`.
- **False "will retry" (#4):** after an error nothing re-triggers. Schedule a retry with backoff on `syncStatus === 'error'` (e.g. 30s, cap retries or back off exponentially), and auto-clear the error chip after a few seconds — the plan (line 1308) says the chip shows "briefly", currently it persists (`:1161-1174`).
- Tests: this file has `CycleApp.test.js` — add coverage where feasible for the merge helper (extract it as a pure exported function so it's testable: `mergeSyncResult(prev, snapshotStarts, resultPeriods)`).
- **Depends on Task 1** (doSync call site may change). Verify: `npx vitest run`, `npm run build`.

## Task 3: `Synced - tomorrow` subtitle fix — **[Sonnet]** (Important #6)

`syncSubtitle` (`src/CycleApp.jsx:74`) passes a full timestamp to `relDays`, which rounds `(target − localMidnight)/day` — any sync after local noon renders "Synced - tomorrow". Truncate to a local date (`new Date(y, m, d)`) before `relDays`, or better, show a time-relative string ("just now", "2h ago", "yesterday"). Add a small unit test if `syncSubtitle` is exported.

## Task 4: Remaining test gaps — **[Sonnet]** (Minor #9, partly covered by Tasks 1–2)

In `src/run-sync.test.js`: (a) `pushUpdates` path — remote/local date conflict with local `updatedAt` newer → assert `patchEventDate` called; (b) partial failure — make `insertAllDayEvent` reject on the second create → assert `runSync` rejects (so callers keep tombstones and don't apply `syncedAt`). Mock only `auth.js`/`gcal.js`; keep the real planner, as the existing test does.

## Task 5: Minor polish — **[Sonnet]** (Minor #7, #8, #10)

- README: add a setup note that `src/sync-config.js` is gitignored and must be copied from `src/sync-config.example.js` before building. (Check first — a concurrent README edit may already cover this.)
- `src/CycleApp.jsx:1028-1030`: add a comment (or eslint-disable with reason) explaining `doSync` is intentionally omitted from the connect effect's deps to avoid per-data-change re-fires.
- Typography: `'Syncing...'` → `'Syncing…'`, `'Sync failed - will retry'` → `'Sync failed — will retry'`, `'Synced - …'` → `'Synced · …'` (plan specified `·`), matching the pre-existing chip.

## Task 6: Annotate the original plan doc — **[Sonnet]**

`docs/superpowers/plans/2026-07-02-google-calendar-sync.md` Task 8 snippets contain the bugs fixed above (UTC `isoDate(now)` at ~line 1229/1233; stale `setPeriods` at ~1277; non-settling debounce at ~1293-1298). Add a short correction note under each so a future re-execution doesn't reintroduce them. Doc-only change.

## Final verification

`npx vitest run` and `npm run build` after all tasks; the Android `gradlew assembleDebug` check and the plan's Step 4 runtime verify (browser/emulator) remain pending on Jade as before.

---

**Assignment rationale:** Tasks 1–2 carry the data-loss stakes and React concurrency subtlety → Opus. Tasks 3–6 are precisely specified, small-surface changes → Sonnet. If running agents in parallel: Task 1 → Task 2 sequentially; Tasks 3–6 can run after Task 2 lands (3 and 5 touch `CycleApp.jsx`, so don't run them concurrently with Task 2).
