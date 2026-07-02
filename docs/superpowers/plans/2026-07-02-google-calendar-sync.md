# Google Calendar 2-Way Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-entry end dates, JSON import/export, and real two-way sync between the Cycle app and Jade's "Period Tracker" Google Calendar.

**Architecture:** Schema v2 turns each period into an entry object carrying an optional end date and Google event ids. Import/Export moves data as JSON (no OAuth). Sync is a pure planner (`planSync`) fed by a thin Calendar REST client, authenticated with a manual OAuth PKCE flow (public Android client, tokens on-device).

**Tech Stack:** React 19 + Vite 7 + Capacitor 7 (existing), Vitest (existing), new deps: `@capacitor/share`, `@capacitor/browser`, `@capacitor/preferences`.

**Read first:** `docs/superpowers/specs/2026-07-02-google-calendar-sync-design.md` — especially the "Recurring-events reality" section. The user's calendar is two infinite recurring series with FUTURE PROJECTION instances that must never become entries.

## Global Constraints

- All app code lives in `src/` (`CycleApp.jsx`, `main.jsx`, `styles.css`). Root-level `cycle-app.jsx`, `android-frame.jsx`, `tweaks-panel.jsx`, `Cycle.html` are legacy mockups — do not touch them.
- Tests: `npx vitest run` (all existing 11 tests must stay green). Test files: `src/*.test.js`.
- Build check: `npm run build` (catches JSX errors). Android: `npm run cap:sync` then `cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug --no-daemon`.
- Runtime verification: dev server `npm run dev` → http://localhost:5173 (Chrome browser tools). Android emulator AVD `cycle-test` exists; adb at `$HOME/Android/Sdk/platform-tools/adb`; launch emulator with `$HOME/Android/Sdk/emulator/emulator -avd cycle-test -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot`.
- Style: inline styles, palette from the `c` object, fonts via `var(--font-ui)` / `var(--font-display)`, chevron-stepper idiom for date input. No CSS frameworks. Code comments only for non-obvious constraints.
- Dates are LOCAL dates serialized `YYYY-MM-DD` via existing `serializeDate`/`parseStoredDate`. Never use `new Date('YYYY-MM-DD')` (parses as UTC) — always `parseStoredDate`.
- Storage key stays `cycle-app.state.v1`. Never delete user data on parse failure of a single entry — skip the entry.
- `period-import.json` (repo root, gitignored) is the user's real health data: 40 entries, ids from her calendar. NEVER commit it, never paste its contents into commits, logs, or PRs.
- Calendar ID (hard reference, in `sync-config.example.js`): `2b2cdbe5807596c88ccd37cb915a3f8056f85ae861e4407da01ca4fabd2508c4@group.calendar.google.com`, display name "Period Tracker".
- Commit after every task with the trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.

## File Structure

- `src/CycleApp.jsx` — entry model helpers, migration, all UI (existing single-file pattern; stays).
- `src/CycleApp.test.js` — helper/migration/merge tests (existing).
- `src/sync.js` — NEW: pure sync logic: `pairRemoteEvents`, `planSync`.
- `src/sync.test.js` — NEW: sync logic tests.
- `src/gcal.js` — NEW: Calendar REST client (fetch + token).
- `src/auth.js` — NEW: OAuth PKCE flow + token storage.
- `src/sync-config.js` — NEW, gitignored: `{ clientId, calendarName, calendarId }`.
- `src/sync-config.example.js` — NEW, committed template.
- `src/main.jsx` — persistence pass-through for new state fields.
- `docs/google-cloud-setup.md` — NEW: Jade's one-time setup instructions.

---

### Task 1: Entry model + schema v2 migration

**Files:**
- Modify: `src/CycleApp.jsx` (helpers around lines 36–130, exports at bottom)
- Test: `src/CycleApp.test.js`

**Interfaces:**
- Produces (consumed by every later task):
  - Entry shape: `{ start: Date, end: Date|null, startEventId: string|null, endEventId: string|null, updatedAt: string /* ISO */ }`
  - `makeEntry(startDate) -> entry` (nulls elsewhere, `updatedAt` = now)
  - `hasPeriodOn(entries, date) -> boolean` (compares `entry.start` day)
  - `addPeriodEntry(entries, date) -> entries` (no-op if day exists; sorted by start)
  - `setPeriodDate(entries, index, date) -> entries` (updates start + updatedAt; no-op on collision/out-of-range)
  - `setPeriodEnd(entries, index, endOrNull) -> entries` (updates end + updatedAt)
  - `removePeriodAt(entries, index) -> entries`
  - `collectEventIds(entry) -> string[]` (non-null ids)
  - `autoPeriodLen(entries) -> number|null` (median of `diffDays(end,start)+1` over the last 5 entries that have ends)
  - `parseStoredEntry(raw) -> entry|null` (accepts v1 string or v2 object)
  - `loadStoredState()` now also returns `deletedEventIds: string[]`, `lastSyncedAt: string|null`; `saveStoredState` persists them and writes `schema: 2` with entries as `{start:'YYYY-MM-DD', end, startEventId, endEventId, updatedAt}`.

- [ ] **Step 1: Write the failing tests** — replace the existing `setPeriodDate`/`removePeriodAt`/`hasPeriodOn`/`addPeriodEntry` describe blocks in `src/CycleApp.test.js` (they currently pass plain `Date` arrays) with entry-based tests, and add migration/median tests:

```js
import { describe, test, expect } from 'vitest';
import {
  hasPeriodOn, addPeriodEntry, setPeriodDate, setPeriodEnd, removePeriodAt,
  makeEntry, collectEventIds, autoPeriodLen, parseStoredEntry,
} from './CycleApp.jsx';

const d = (y, m, day) => new Date(y, m - 1, day);
const entry = (start, extra = {}) => ({
  start, end: null, startEventId: null, endEventId: null,
  updatedAt: '2026-01-01T00:00:00Z', ...extra,
});

describe('entry helpers', () => {
  test('hasPeriodOn matches entry start days', () => {
    const es = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    expect(hasPeriodOn(es, d(2026, 7, 2))).toBe(true);
    expect(hasPeriodOn(es, d(2026, 7, 1))).toBe(false);
  });

  test('addPeriodEntry appends a fresh entry sorted by start', () => {
    const es = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    const out = addPeriodEntry(es, d(2026, 6, 20));
    expect(out.map(e => e.start.getTime())).toEqual(
      [d(2026, 6, 3), d(2026, 6, 20), d(2026, 7, 2)].map(x => x.getTime()));
    expect(out[1].end).toBeNull();
    expect(out[1].startEventId).toBeNull();
    expect(typeof out[1].updatedAt).toBe('string');
  });

  test('addPeriodEntry no-ops on an existing day', () => {
    const es = [entry(d(2026, 7, 2))];
    expect(addPeriodEntry(es, d(2026, 7, 2))).toHaveLength(1);
  });

  test('setPeriodDate moves start, keeps ids, bumps updatedAt', () => {
    const es = [entry(d(2026, 6, 3), { startEventId: 'a' })];
    const out = setPeriodDate(es, 0, d(2026, 6, 5));
    expect(out[0].start.getTime()).toBe(d(2026, 6, 5).getTime());
    expect(out[0].startEventId).toBe('a');
    expect(out[0].updatedAt).not.toBe('2026-01-01T00:00:00Z');
  });

  test('setPeriodDate no-ops on collision and out-of-range', () => {
    const es = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    expect(setPeriodDate(es, 1, d(2026, 6, 3))).toBe(es);
    expect(setPeriodDate(es, 5, d(2026, 6, 9))).toBe(es);
  });

  test('setPeriodEnd sets and clears the end date', () => {
    const es = [entry(d(2026, 6, 3))];
    const withEnd = setPeriodEnd(es, 0, d(2026, 6, 7));
    expect(withEnd[0].end.getTime()).toBe(d(2026, 6, 7).getTime());
    const cleared = setPeriodEnd(withEnd, 0, null);
    expect(cleared[0].end).toBeNull();
  });

  test('removePeriodAt removes by index', () => {
    const es = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    expect(removePeriodAt(es, 0).map(e => e.start.getTime()))
      .toEqual([d(2026, 7, 2).getTime()]);
    expect(removePeriodAt(es, 9)).toBe(es);
  });

  test('collectEventIds returns only non-null ids', () => {
    expect(collectEventIds(entry(d(2026, 6, 3),
      { startEventId: 'a', endEventId: null }))).toEqual(['a']);
    expect(collectEventIds(entry(d(2026, 6, 3),
      { startEventId: 'a', endEventId: 'b' }))).toEqual(['a', 'b']);
  });

  test('autoPeriodLen is the median length of the last 5 ended entries', () => {
    const es = [
      entry(d(2026, 2, 1), { end: d(2026, 2, 3) }),  // 3 days
      entry(d(2026, 3, 1), { end: d(2026, 3, 7) }),  // 7 days
      entry(d(2026, 4, 1), { end: d(2026, 4, 5) }),  // 5 days
      entry(d(2026, 5, 1)),                          // no end — skipped
    ];
    expect(autoPeriodLen(es)).toBe(5);
    expect(autoPeriodLen([entry(d(2026, 5, 1))])).toBeNull();
    expect(autoPeriodLen([])).toBeNull();
  });
});

describe('parseStoredEntry (schema migration)', () => {
  test('migrates a v1 date string', () => {
    const e = parseStoredEntry('2026-06-03');
    expect(e.start.getTime()).toBe(d(2026, 6, 3).getTime());
    expect(e.end).toBeNull();
    expect(e.startEventId).toBeNull();
    expect(typeof e.updatedAt).toBe('string');
  });

  test('parses a v2 object with all fields', () => {
    const e = parseStoredEntry({
      start: '2026-06-28', end: '2026-07-02',
      startEventId: 'ko_1', endEventId: 'l0_1',
      updatedAt: '2026-06-04T22:26:54Z',
    });
    expect(e.start.getTime()).toBe(d(2026, 6, 28).getTime());
    expect(e.end.getTime()).toBe(d(2026, 7, 2).getTime());
    expect(e.startEventId).toBe('ko_1');
    expect(e.updatedAt).toBe('2026-06-04T22:26:54Z');
  });

  test('returns null for garbage, null end for bad end', () => {
    expect(parseStoredEntry(42)).toBeNull();
    expect(parseStoredEntry({ start: 'not-a-date' })).toBeNull();
    expect(parseStoredEntry({ start: '2026-06-28', end: 'junk' }).end).toBeNull();
  });
});
```

Keep the file's existing `hasPeriodOn`/`addPeriodEntry` describe blocks DELETED (they are superseded above — plain-Date arrays are no longer the model).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run`
Expected: FAIL — `makeEntry is not a function` / entries lack `.start` etc.

- [ ] **Step 3: Implement in `src/CycleApp.jsx`.** Replace the current helper block (`hasPeriodOn`, `addPeriodEntry`, `setPeriodDate`, `removePeriodAt` — currently just above `weekdayMonthDay`) with:

```js
// ─── period entries ────────────────────────────────────────────────────────
// { start: Date, end: Date|null, startEventId, endEventId, updatedAt: ISO }
function makeEntry(start) {
  return { start, end: null, startEventId: null, endEventId: null, updatedAt: new Date().toISOString() };
}
function sortEntries(entries) { return [...entries].sort((a, b) => a.start - b.start); }
function hasPeriodOn(entries, date) {
  return entries.some(e => diffDays(e.start, date) === 0);
}
function addPeriodEntry(entries, date) {
  if (hasPeriodOn(entries, date)) return entries;
  return sortEntries([...entries, makeEntry(date)]);
}
function setPeriodDate(entries, index, date) {
  if (index < 0 || index >= entries.length) return entries;
  if (entries.some((e, i) => i !== index && diffDays(e.start, date) === 0)) return entries;
  const next = entries.map((e, i) => i === index
    ? { ...e, start: date, updatedAt: new Date().toISOString() } : e);
  return sortEntries(next);
}
function setPeriodEnd(entries, index, end) {
  if (index < 0 || index >= entries.length) return entries;
  return entries.map((e, i) => i === index
    ? { ...e, end, updatedAt: new Date().toISOString() } : e);
}
function removePeriodAt(entries, index) {
  if (index < 0 || index >= entries.length) return entries;
  return entries.filter((_, i) => i !== index);
}
function collectEventIds(entry) {
  return [entry.startEventId, entry.endEventId].filter(Boolean);
}
function autoPeriodLen(entries) {
  const lens = entries.filter(e => e.end).slice(-5).map(e => diffDays(e.end, e.start) + 1);
  if (!lens.length) return null;
  lens.sort((a, b) => a - b);
  return lens[Math.floor(lens.length / 2)];
}
function parseStoredEntry(raw) {
  if (typeof raw === 'string') {
    const start = parseStoredDate(raw);
    return start ? makeEntry(start) : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const start = parseStoredDate(raw.start);
  if (!start) return null;
  return {
    start,
    end: parseStoredDate(raw.end),
    startEventId: raw.startEventId || null,
    endEventId: raw.endEventId || null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}
function serializeEntry(e) {
  return {
    start: serializeDate(e.start),
    end: e.end ? serializeDate(e.end) : null,
    startEventId: e.startEventId,
    endEventId: e.endEventId,
    updatedAt: e.updatedAt,
  };
}
```

Update `loadStoredState` — the `periods` line becomes entry-based and two fields are added:

```js
      periods: Array.isArray(parsed.periods)
        ? sortEntries(parsed.periods.map(parseStoredEntry).filter(Boolean))
        : [],
      deletedEventIds: Array.isArray(parsed.deletedEventIds) ? parsed.deletedEventIds : [],
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
```

Update `saveStoredState`:

```js
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      schema: 2,
      periods: state.periods.map(serializeEntry),
    }));
```

Update the export line at the bottom of the file:

```js
export {
  LIGHT, DARK, loadStoredState, saveStoredState,
  makeEntry, hasPeriodOn, addPeriodEntry, setPeriodDate, setPeriodEnd,
  removePeriodAt, collectEventIds, autoPeriodLen, parseStoredEntry, serializeEntry,
};
```

Also DELETE the unused `scenarioPeriods` function (verified unused: `grep -rn scenarioPeriods src/` shows only its definition).

NOTE: the component will not compile against the new model until Task 2 — that is expected; Task 1 and 2 land as one commit pair, but run the unit tests now (they import only helpers, and Vite's transform tolerates the not-yet-updated component because tests never render it — the component still references `periods` as entries incorrectly only at runtime, not import time). If `npm run build` is run here it may still pass (no type checking); do not runtime-verify until Task 2.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (all new tests; old superseded tests removed).

- [ ] **Step 5: Commit**

```bash
git add src/CycleApp.jsx src/CycleApp.test.js
git commit -m "Add entry-based period model with schema v2 migration"
```

---

### Task 2: Component refactor to entries (behavior otherwise unchanged)

**Files:**
- Modify: `src/CycleApp.jsx` (the `CycleApp` component + `EditLastModal` props), `src/main.jsx`

**Interfaces:**
- Consumes: entry helpers from Task 1.
- Produces: component state `periods` is `entry[]`; new state `deletedEventIds: string[]` + setter; `onSettingsChange` payload now includes `periods` (entries), `deletedEventIds`, `lastSyncedAt`.

Every place that treated a period as a `Date` now uses `.start`. Concretely, in `CycleApp`:

- [ ] **Step 1: Update `CycleApp` internals.** Apply these changes:

New state next to the others (initial values from new props):

```js
  const [deletedEventIds, setDeletedEventIds] = useState(() => initialDeletedEventIds || []);
```

Add props `initialDeletedEventIds = []` and `initialLastSyncedAt = null` to the component signature; include both in the `onSettingsChange` effect payload:

```js
    onSettingsChange?.({ periods, deletedEventIds, lastSyncedAt: initialLastSyncedAt, cycleLen, cycleMode, periodLen, periodMode, calSync });
```

(`lastSyncedAt` becomes live state in Task 8; passing it through unchanged here keeps persistence lossless.)

Auto cycle-length effect — gaps use starts:

```js
    const sorted = sortEntries(periods);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(diffDays(sorted[i].start, sorted[i - 1].start));
```

Auto period-length (NEW effect — `periodMode === 'auto'` previously did nothing):

```js
  useEffect(() => {
    if (periodMode !== 'auto') return;
    setPeriodLen(autoPeriodLen(periods) ?? 5);
  }, [periods, periodMode]);
```

Derived values:

```js
  const last = periods.length ? periods[periods.length - 1] : null;
  const next = last ? addDays(last.start, cycleLen) : null;
```

`handleConfirm` — unchanged except it already calls `addPeriodEntry` (now entry-based; no edit needed beyond what Task 1 changed).

`historyRows` — entries with per-entry length when an end exists:

```js
  const historyRows = useMemo(() => {
    const sorted = sortEntries(periods);
    return sorted.map((e, i) => ({
      entry: e, idx: i,
      gap: i > 0 ? diffDays(e.start, sorted[i - 1].start) : null,
    })).reverse();
  }, [periods]);
```

History row rendering: `r.date` becomes `r.entry.start` (`fmtShort(r.entry.start)`, `r.entry.start.getFullYear()`).

`LastBlock` call site: pass the entry (`last={last}`) and inside `LastBlock` use `last.start` for `fmt`/`relDays`, and the range line becomes:

```jsx
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint, marginTop: 6 }}>
            {last.end
              ? `${fmtRange(last.start, diffDays(last.end, last.start) + 1)} · ${diffDays(last.end, last.start) + 1} days`
              : `${fmtRange(last.start, periodLength)} · ${periodLength} days`}
          </div>
```

(`LastBlock` receives the whole entry; rename its internal uses accordingly.)

LogButton `disabled` prop: `hasPeriodOn(periods, addDays(todayBase, logOffset))` — unchanged text, already entry-based after Task 1.

`EditLastModal` call site:

```jsx
      {editIndex !== null && periods[editIndex] && (
        <EditLastModal c={c} open onClose={() => setEditIndex(null)}
          entry={periods[editIndex]} periodLength={periodLen}
          onDelete={() => {
            const ids = collectEventIds(periods[editIndex]);
            if (ids.length) setDeletedEventIds(t => [...t, ...ids]);
            setPeriods(p => removePeriodAt(p, editIndex));
            setEditIndex(null);
          }}
          onEditDate={(date) => setPeriods(p => setPeriodDate(p, editIndex, date))}
          onEditEnd={(end) => setPeriods(p => setPeriodEnd(p, editIndex, end))}
          minDate={editIndex > 0 ? addDays(periods[editIndex - 1].start, 1) : null}
          maxDate={editIndex < periods.length - 1 ? addDays(periods[editIndex + 1].start, -1) : addDays(todayBase, 7)}/>
      )}
```

In `EditLastModal`, rename prop `last` → `entry`; all `last` references become `entry.start` (display) and the draft reset becomes `setDraft(entry.start)`. `onEditEnd` is wired in Task 3 (accept the prop now).

- [ ] **Step 2: Update `src/main.jsx`** — pass through the new fields:

```jsx
      initialDeletedEventIds={stored.deletedEventIds || []}
      initialLastSyncedAt={stored.lastSyncedAt ?? null}
```

(add to the `<CycleApp …>` props; `handleSettingsChange` already spreads `next` into stored state, so the new payload fields persist automatically).

- [ ] **Step 3: Tests + build**

Run: `npx vitest run` → PASS. Run: `npm run build` → succeeds.

- [ ] **Step 4: Runtime-verify migration + parity in the browser.** Start `npm run dev`, then in the browser tab:
1. `localStorage.setItem('cycle-app.state.v1', JSON.stringify({periods:['2026-06-25','2026-06-28','2026-07-01'],cycleLen:27,cycleMode:'manual',periodLen:5,periodMode:'manual'}))` (v1 format) → reload → 3 history entries render, prediction = last start + 27. This proves migration.
2. Log a period, edit a date, delete an entry — all still work.
3. Delete an entry that has event ids: seed `{periods:[{start:'2026-06-28',end:'2026-07-02',startEventId:'x1',endEventId:'x2',updatedAt:'2026-06-04T00:00:00Z'}], ...}` → delete it in the UI → `JSON.parse(localStorage.getItem('cycle-app.state.v1')).deletedEventIds` equals `['x1','x2']`.
4. Clear localStorage when done.

- [ ] **Step 5: Commit**

```bash
git add src/CycleApp.jsx src/main.jsx
git commit -m "Refactor component to entry model with delete tombstones"
```

---

### Task 3: "Ended" stepper in the entry modal

**Files:**
- Modify: `src/CycleApp.jsx` (`EditLastModal`)
- Test: none new (UI; bounds logic reuses tested helpers) — runtime verify.

**Interfaces:**
- Consumes: `entry`, `onEditEnd(end: Date|null)`, `minDate`, `maxDate` from Task 2.

- [ ] **Step 1: Extend the modal's editing mode with an end-date stepper.** In `EditLastModal`, add draft state `const [draftEnd, setDraftEnd] = useState(entry.end);` (reset alongside `draft` in the `open` effect). In the editing branch, below the existing start stepper and above Save, add:

```jsx
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18 }}>Ended</div>
            {draftEnd ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 4 }}>
                <button onClick={() => canEndBack && setDraftEnd(addDays(draftEnd, -1))} disabled={!canEndBack} style={chevronStyle(canEndBack)}>
                  <ChevronLeft c="currentColor" s={24}/>
                </button>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: c.textPrimary, letterSpacing: -0.3 }}>{fmt(draftEnd)}</div>
                  <button onClick={() => setDraftEnd(null)} style={{ border: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: 12, color: c.textSecondary, cursor: 'pointer', marginTop: 2 }}>Clear</button>
                </div>
                <button onClick={() => canEndFwd && setDraftEnd(addDays(draftEnd, 1))} disabled={!canEndFwd} style={chevronStyle(canEndFwd)}>
                  <ChevronRight c="currentColor" s={24}/>
                </button>
              </div>
            ) : (
              <button onClick={() => setDraftEnd(addDays(draft, Math.max(0, periodLength - 1)))} style={{
                width: '100%', height: 44, marginTop: 10, borderRadius: 14,
                border: `1px solid ${c.hairline}`, background: 'transparent', color: c.textSecondary,
                fontFamily: 'var(--font-ui)', fontSize: 14, cursor: 'pointer',
              }}>Set end date</button>
            )}
```

Bounds (place next to `canBack`/`canFwd`):

```js
  const endMax = maxDate; // same ceiling: next entry − 1, or today + 7
  const canEndBack = draftEnd && diffDays(addDays(draftEnd, -1), draft) >= 0;
  const canEndFwd = draftEnd && diffDays(addDays(draftEnd, 1), endMax) <= 0;
```

Save button applies both, clamping end if the start moved past it:

```js
            <button onClick={() => {
              onEditDate(draft);
              onEditEnd(draftEnd && diffDays(draftEnd, draft) >= 0 ? draftEnd : draftEnd ? draft : null);
              onClose();
            }} ...>
```

View mode: under the existing range line add an end line:

```jsx
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textFaint, marginTop: 4 }}>
          {entry.end ? `Ended ${fmt(entry.end)}` : 'End not recorded'}
        </div>
```

- [ ] **Step 2: Tests + build:** `npx vitest run` → PASS; `npm run build` → OK.

- [ ] **Step 3: Runtime verify (browser):** seed two entries, open modal → Edit date: set an end via "Set end date", step it, check bounds (can't go below start; can't pass next entry − 1 / today + 7), Save → view shows "Ended <date>"; Last-period card shows the real range; Settings → Period length AUTO now tracks the median of real ends (seed entries with 4- and 6-day spans → auto shows 5–6 accordingly). Clear end → "End not recorded". Clean localStorage after.

- [ ] **Step 4: Commit**

```bash
git add src/CycleApp.jsx
git commit -m "Add per-entry end date editing and auto period length from real ends"
```

---

### Task 4: Export + Import (JSON, merge)

**Files:**
- Modify: `src/CycleApp.jsx` (Settings sheet; new `ImportModal`; merge helper), `package.json` (dep)
- Test: `src/CycleApp.test.js`

**Interfaces:**
- Produces: `mergeImportedPeriods(existing, incoming) -> entries` (exported).
- Import format = storage format: `{ schema: 2, periods: [{start, end, startEventId, endEventId, updatedAt}] }`; also accepts a bare array.

- [ ] **Step 1: Install dep** — `npm install @capacitor/share && npx cap sync android`

- [ ] **Step 2: Write failing merge tests** (append to `src/CycleApp.test.js`):

```js
import { mergeImportedPeriods } from './CycleApp.jsx';

describe('mergeImportedPeriods', () => {
  const base = (start, extra = {}) => ({
    start, end: null, startEventId: null, endEventId: null,
    updatedAt: '2026-01-01T00:00:00Z', ...extra,
  });

  test('unions disjoint dates sorted', () => {
    const out = mergeImportedPeriods([base(d(2026, 6, 3))], [base(d(2026, 5, 6))]);
    expect(out.map(e => e.start.getTime()))
      .toEqual([d(2026, 5, 6), d(2026, 6, 3)].map(x => x.getTime()));
  });

  test('same-date: incoming fills missing end and ids', () => {
    const out = mergeImportedPeriods(
      [base(d(2026, 6, 28))],
      [base(d(2026, 6, 28), { end: d(2026, 7, 2), startEventId: 'a', endEventId: 'b' })]);
    expect(out).toHaveLength(1);
    expect(out[0].end.getTime()).toBe(d(2026, 7, 2).getTime());
    expect(out[0].startEventId).toBe('a');
  });

  test('same-date conflict: newer updatedAt wins per entry', () => {
    const out = mergeImportedPeriods(
      [base(d(2026, 6, 28), { end: d(2026, 7, 1), updatedAt: '2026-07-01T00:00:00Z' })],
      [base(d(2026, 6, 28), { end: d(2026, 7, 3), updatedAt: '2026-06-01T00:00:00Z' })]);
    expect(out[0].end.getTime()).toBe(d(2026, 7, 1).getTime());
  });

  test('never removes existing entries', () => {
    const out = mergeImportedPeriods(
      [base(d(2026, 6, 3)), base(d(2026, 7, 2))], []);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run` → FAIL (`mergeImportedPeriods is not a function`).

- [ ] **Step 4: Implement + export in `src/CycleApp.jsx`:**

```js
function mergeImportedPeriods(existing, incoming) {
  const out = [...existing];
  for (const inc of incoming) {
    const i = out.findIndex(e => diffDays(e.start, inc.start) === 0);
    if (i === -1) { out.push(inc); continue; }
    const cur = out[i];
    const newerIncoming = inc.updatedAt > cur.updatedAt;
    out[i] = {
      ...cur,
      end: cur.end && inc.end ? (newerIncoming ? inc.end : cur.end) : (cur.end || inc.end),
      startEventId: cur.startEventId || inc.startEventId,
      endEventId: cur.endEventId || inc.endEventId,
      updatedAt: newerIncoming ? inc.updatedAt : cur.updatedAt,
    };
  }
  return sortEntries(out);
}
```

Run `npx vitest run` → PASS.

- [ ] **Step 5: Wire Export.** At the top of `src/CycleApp.jsx` add `import { Share } from '@capacitor/share';` and `import { Capacitor } from '@capacitor/core';`. In `SettingsSheet`, the export button (currently dead, subtitle "CSV to Google Sheets") gets:

```jsx
          <button onClick={onExport} ...existing styles...>
            <div>
              <div style={{ ... }}>Export data</div>
              <div style={{ ... }}>JSON backup</div>
            </div>
```

and `CycleApp` passes:

```js
  const handleExport = async () => {
    const json = JSON.stringify({ schema: 2, periods: periods.map(serializeEntry) }, null, 2);
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: 'Cycle data', text: json }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(json).catch(() => {});
    }
  };
```

- [ ] **Step 6: Add Import UI.** New Settings row "Import data / Paste a JSON backup" below Export, opening a modal (same overlay pattern as `EditLastModal`, zIndex 50):

```jsx
function ImportModal({ c, open, onClose, onImport }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { if (open) { setText(''); setError(null); } }, [open]);
  if (!open) return null;
  const handleImport = () => {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.periods;
      if (!Array.isArray(list)) throw new Error('no periods array');
      const entries = list.map(parseStoredEntry).filter(Boolean);
      if (!entries.length) throw new Error('no valid entries');
      onImport(entries);
      onClose();
    } catch {
      setError("Couldn't read that — paste the full JSON backup.");
    }
  };
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,15,0.4)', zIndex: 50 }} />
      <div style={{ position: 'absolute', left: 24, right: 24, top: '20%', background: c.bg, borderRadius: 22, padding: 24, zIndex: 51, boxShadow: '0 30px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' }}>Import data</div>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder='Paste JSON backup here'
          style={{ width: '100%', height: 160, marginTop: 12, borderRadius: 14, border: `1px solid ${c.hairline}`, background: c.surface, color: c.textPrimary, fontFamily: 'monospace', fontSize: 12, padding: 12, resize: 'none', boxSizing: 'border-box' }}/>
        {error && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.warning, marginTop: 8 }}>{error}</div>}
        <button onClick={handleImport} style={{ width: '100%', height: 52, marginTop: 14, borderRadius: 14, border: 'none', background: c.accent, color: '#FFFEFB', fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Import</button>
        <button onClick={onClose} style={{ width: '100%', height: 44, marginTop: 8, border: 'none', background: 'transparent', color: c.textSecondary, fontFamily: 'var(--font-ui)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
      </div>
    </>
  );
}
```

`CycleApp`: `const [importOpen, setImportOpen] = useState(false);`, render `<ImportModal c={c} open={importOpen} onClose={() => setImportOpen(false)} onImport={(entries) => setPeriods(p => mergeImportedPeriods(p, entries))}/>`, and the Settings row calls `setImportOpen(true)` (also `setSettingsOpen(false)` first so the sheets don't stack).

- [ ] **Step 7: Runtime verify (browser):** clear localStorage → Settings → Import data → paste the CONTENTS of `/home/jade/Documents/cycle/period-import.json` → Import. Expect: history "40 entries", last period June 28 with "Ended July 2" in its modal, prediction ≈ July 24–26 (June 28 + auto cycle ≈ 26–28), Settings period length AUTO ≈ 5–6. Then Export (web copies to clipboard) → `navigator.clipboard.readText()` starts with `{"schema": 2` and contains `"startEventId"`. Garbage paste shows the inline error and changes nothing. Clear localStorage after.

- [ ] **Step 8: Commit**

```bash
git add src/CycleApp.jsx src/CycleApp.test.js package.json package-lock.json
git commit -m "Add JSON export via share sheet and merging import"
```

---

### Task 5: Sync planner (pure logic)

**Files:**
- Create: `src/sync.js`
- Test: `src/sync.test.js`

**Interfaces:**
- Produces (consumed by Task 8):
  - `pairRemoteEvents(events, todayStr)` — `events: [{id, summary, date: 'YYYY-MM-DD', updated: ISO}]` → `[{start, end|null, startEventId, endEventId|null, updated}]` (all string dates). Ignores events with `date > todayStr` (future projections!), unknown summaries, and pairs each start with the first end where `start <= end < nextStart` and `end - start <= 14 days`.
  - `planSync({ local, remote, deletedEventIds, timeMin })` → `{ pushCreates, pushUpdates, pushDeletes, localPeriods, clearedTombstones }` where
    - `local`: serialized entries (`{start:'YYYY-MM-DD', end, startEventId, endEventId, updatedAt}`)
    - `pushCreates`: `[{ kind: 'start'|'end', date: 'YYYY-MM-DD', localStart: 'YYYY-MM-DD' }]` (`localStart` identifies which entry receives the created event id)
    - `pushUpdates`: `[{ eventId, date }]`, `pushDeletes`: `[eventId]`
    - `localPeriods`: the post-sync serialized entries, sorted
    - `clearedTombstones`: every tombstone consumed this run (all of them — matched ones get deletes pushed, unmatched are already gone)

- [ ] **Step 1: Write failing tests** in `src/sync.test.js`:

```js
import { describe, test, expect } from 'vitest';
import { pairRemoteEvents, planSync } from './sync.js';

const ev = (id, summary, date, updated = '2026-01-01T00:00:00Z') => ({ id, summary, date, updated });
const le = (start, extra = {}) => ({
  start, end: null, startEventId: null, endEventId: null,
  updatedAt: '2026-01-01T00:00:00Z', ...extra,
});

describe('pairRemoteEvents', () => {
  test('pairs starts with the first end before the next start', () => {
    const out = pairRemoteEvents([
      ev('s1', 'period start', '2026-06-03'),
      ev('e1', 'period end', '2026-06-07'),
      ev('s2', 'period start', '2026-06-28'),
      ev('e2', 'period end', '2026-07-02'),
    ], '2026-07-02');
    expect(out).toEqual([
      { start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-01-01T00:00:00Z' },
      { start: '2026-06-28', end: '2026-07-02', startEventId: 's2', endEventId: 'e2', updated: '2026-01-01T00:00:00Z' },
    ]);
  });

  test('drops future projections and unknown summaries', () => {
    const out = pairRemoteEvents([
      ev('s1', 'period start', '2026-06-28'),
      ev('s2', 'period start', '2026-07-23'),   // future projection
      ev('e2', 'period end', '2026-07-27'),     // future projection
      ev('x', 'dentist', '2026-06-29'),
    ], '2026-07-02');
    expect(out).toEqual([
      { start: '2026-06-28', end: null, startEventId: 's1', endEventId: null, updated: '2026-01-01T00:00:00Z' },
    ]);
  });

  test('does not pair an end more than 14 days after the start', () => {
    const out = pairRemoteEvents([
      ev('s1', 'period start', '2026-05-01'),
      ev('e1', 'period end', '2026-05-20'),
    ], '2026-07-02');
    expect(out[0].end).toBeNull();
  });
});

describe('planSync', () => {
  const args = (over = {}) => ({ local: [], remote: [], deletedEventIds: [], timeMin: '2024-07-02', ...over });

  test('local-only entry without ids is pushed as creates', () => {
    const p = planSync(args({ local: [le('2026-06-28', { end: '2026-07-02' })] }));
    expect(p.pushCreates).toEqual([
      { kind: 'start', date: '2026-06-28', localStart: '2026-06-28' },
      { kind: 'end', date: '2026-07-02', localStart: '2026-06-28' },
    ]);
    expect(p.localPeriods).toHaveLength(1);
  });

  test('remote-only entry is adopted locally', () => {
    const p = planSync(args({ remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-06-04T00:00:00Z' }] }));
    expect(p.localPeriods).toEqual([
      { start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updatedAt: '2026-06-04T00:00:00Z' },
    ]);
    expect(p.pushCreates).toEqual([]);
  });

  test('tombstoned remote entry is deleted remotely, not re-adopted', () => {
    const p = planSync(args({
      remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-01-01T00:00:00Z' }],
      deletedEventIds: ['s1', 'e1'],
    }));
    expect(p.pushDeletes.sort()).toEqual(['e1', 's1']);
    expect(p.localPeriods).toEqual([]);
    expect(p.clearedTombstones.sort()).toEqual(['e1', 's1']);
  });

  test('matched by id, local newer -> push update', () => {
    const p = planSync(args({
      local: [le('2026-06-05', { startEventId: 's1', updatedAt: '2026-06-10T00:00:00Z' })],
      remote: [{ start: '2026-06-03', end: null, startEventId: 's1', endEventId: null, updated: '2026-06-01T00:00:00Z' }],
    }));
    expect(p.pushUpdates).toEqual([{ eventId: 's1', date: '2026-06-05' }]);
    expect(p.localPeriods[0].start).toBe('2026-06-05');
  });

  test('matched by id, remote newer -> adopt remote date', () => {
    const p = planSync(args({
      local: [le('2026-06-05', { startEventId: 's1', updatedAt: '2026-06-01T00:00:00Z' })],
      remote: [{ start: '2026-06-03', end: null, startEventId: 's1', endEventId: null, updated: '2026-06-10T00:00:00Z' }],
    }));
    expect(p.pushUpdates).toEqual([]);
    expect(p.localPeriods[0].start).toBe('2026-06-03');
  });

  test('local end added after remote (no end event) -> push end create; remote end adopted when local lacks one', () => {
    const p1 = planSync(args({
      local: [le('2026-06-03', { startEventId: 's1', end: '2026-06-07', updatedAt: '2026-06-10T00:00:00Z' })],
      remote: [{ start: '2026-06-03', end: null, startEventId: 's1', endEventId: null, updated: '2026-06-01T00:00:00Z' }],
    }));
    expect(p1.pushCreates).toEqual([{ kind: 'end', date: '2026-06-07', localStart: '2026-06-03' }]);
    const p2 = planSync(args({
      local: [le('2026-06-03', { startEventId: 's1' })],
      remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-06-10T00:00:00Z' }],
    }));
    expect(p2.localPeriods[0].end).toBe('2026-06-07');
    expect(p2.localPeriods[0].endEventId).toBe('e1');
  });

  test('entry with id missing remotely inside window -> deleted locally; outside window -> kept', () => {
    const inWindow = planSync(args({
      local: [le('2026-06-03', { startEventId: 'gone', endEventId: 'gone-e' })],
    }));
    expect(inWindow.localPeriods).toEqual([]);
    expect(inWindow.pushDeletes).toEqual(['gone-e']);
    const outOfWindow = planSync(args({
      local: [le('2023-08-11', { startEventId: 'old' })],
      timeMin: '2024-07-02',
    }));
    expect(outOfWindow.localPeriods).toHaveLength(1);
  });

  test('id-less local entry matching a remote date adopts its ids', () => {
    const p = planSync(args({
      local: [le('2026-06-03')],
      remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-06-04T00:00:00Z' }],
    }));
    expect(p.localPeriods).toHaveLength(1);
    expect(p.localPeriods[0].startEventId).toBe('s1');
    expect(p.pushCreates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/sync.test.js` → FAIL (module doesn't exist).

- [ ] **Step 3: Implement `src/sync.js`:**

```js
// Pure sync logic. All dates are 'YYYY-MM-DD' strings here (lexicographic
// order == chronological order); Date objects never cross this boundary.

const DAY_MS = 86400000;
const dstr = (s) => s; // readability alias
function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
}

export function pairRemoteEvents(events, todayStr) {
  const usable = events
    .filter(e => e.date <= todayStr)
    .filter(e => ['period start', 'period end'].includes((e.summary || '').trim().toLowerCase()));
  const starts = usable.filter(e => e.summary.trim().toLowerCase() === 'period start')
    .sort((a, b) => a.date < b.date ? -1 : 1);
  const ends = usable.filter(e => e.summary.trim().toLowerCase() === 'period end')
    .sort((a, b) => a.date < b.date ? -1 : 1);
  const usedEnds = new Set();
  return starts.map((s, i) => {
    const nextStart = starts[i + 1]?.date ?? '9999-12-31';
    const end = ends.find(e => !usedEnds.has(e.id) && e.date >= s.date &&
      e.date < nextStart && daysBetween(s.date, e.date) <= 14);
    if (end) usedEnds.add(end.id);
    return {
      start: s.date, end: end ? end.date : null,
      startEventId: s.id, endEventId: end ? end.id : null,
      updated: s.updated,
    };
  });
}

export function planSync({ local, remote, deletedEventIds, timeMin }) {
  const plan = { pushCreates: [], pushUpdates: [], pushDeletes: [], localPeriods: [], clearedTombstones: [...deletedEventIds] };
  const tombstones = new Set(deletedEventIds);
  const byId = new Map(remote.map(r => [r.startEventId, r]));
  const byDate = new Map(remote.map(r => [r.start, r]));
  const claimed = new Set();

  for (const entry of local) {
    let e = { ...entry };
    let r = e.startEventId ? byId.get(e.startEventId) : null;
    if (!r && !e.startEventId) {
      const cand = byDate.get(e.start);
      if (cand && !claimed.has(cand.startEventId)) r = cand;
    }

    if (r) {
      claimed.add(r.startEventId);
      const localNewer = e.updatedAt > r.updated;
      e.startEventId = r.startEventId;
      if (e.start !== r.start) {
        if (localNewer) plan.pushUpdates.push({ eventId: r.startEventId, date: e.start });
        else { e.start = r.start; e.updatedAt = r.updated; }
      }
      if (r.end && !e.end) { e.end = r.end; e.endEventId = r.endEventId; }
      else if (r.end && e.end) {
        e.endEventId = e.endEventId || r.endEventId;
        if (e.end !== r.end) {
          if (localNewer) plan.pushUpdates.push({ eventId: r.endEventId, date: e.end });
          else e.end = r.end;
        }
      } else if (!r.end && e.end) {
        if (e.endEventId) { e.end = null; e.endEventId = null; } // end deleted remotely
        else plan.pushCreates.push({ kind: 'end', date: e.end, localStart: e.start });
      }
      plan.localPeriods.push(e);
    } else if (e.startEventId) {
      if (e.start < timeMin) { plan.localPeriods.push(e); continue; } // outside pull window
      if (e.endEventId) plan.pushDeletes.push(e.endEventId); // start deleted remotely; clean up its end
    } else {
      plan.pushCreates.push({ kind: 'start', date: e.start, localStart: e.start });
      if (e.end) plan.pushCreates.push({ kind: 'end', date: e.end, localStart: e.start });
      plan.localPeriods.push(e);
    }
  }

  for (const r of remote) {
    if (claimed.has(r.startEventId)) continue;
    if (tombstones.has(r.startEventId)) {
      plan.pushDeletes.push(r.startEventId);
      if (r.endEventId) plan.pushDeletes.push(r.endEventId);
      continue;
    }
    plan.localPeriods.push({
      start: r.start, end: r.end,
      startEventId: r.startEventId, endEventId: r.endEventId,
      updatedAt: r.updated,
    });
  }

  plan.localPeriods.sort((a, b) => a.start < b.start ? -1 : 1);
  return plan;
}
```

- [ ] **Step 4: Run** `npx vitest run` → ALL PASS (new + existing). If a test fails, fix `sync.js`, not the test — the tests encode the spec's merge rules.

- [ ] **Step 5: Commit**

```bash
git add src/sync.js src/sync.test.js
git commit -m "Add pure sync planner with projection filtering and tombstones"
```

---

### Task 6: Google Calendar REST client

**Files:**
- Create: `src/gcal.js`
- Create: `src/sync-config.example.js`
- Test: none (thin fetch wrappers; exercised end-to-end in Task 9).

**Interfaces:**
- Produces (consumed by Task 8):
  - `findPeriodCalendar(token) -> calendarId` (finds by exact summary from config, creates if absent)
  - `listPeriodEvents(token, calendarId, timeMinIso, timeMaxIso) -> [{id, summary, date, updated}]` (paginated, `singleEvents=true`)
  - `insertAllDayEvent(token, calendarId, summary, date) -> eventId`
  - `patchEventDate(token, calendarId, eventId, date) -> void`
  - `deleteEvent(token, calendarId, eventId) -> void` (404/410 tolerated)
  - All throw `GcalError(status, message)` on other failures.

- [ ] **Step 1: Create `src/sync-config.example.js`:**

```js
// Copy to src/sync-config.js (gitignored) and fill in your OAuth client id.
export const SYNC_CONFIG = {
  // OAuth 2.0 client id, type "Android", from Google Cloud Console.
  clientId: 'REPLACE_ME.apps.googleusercontent.com',
  calendarName: 'Period Tracker',
  // Jade's existing calendar (looked up by name if this id 404s):
  calendarId: '2b2cdbe5807596c88ccd37cb915a3f8056f85ae861e4407da01ca4fabd2508c4@group.calendar.google.com',
};
```

Also `cp src/sync-config.example.js src/sync-config.js` (the gitignored working copy; builds need it to exist).

- [ ] **Step 2: Create `src/gcal.js`:**

```js
const BASE = 'https://www.googleapis.com/calendar/v3';

export class GcalError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gfetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new GcalError(res.status, await res.text().catch(() => res.statusText));
  return res.json();
}

export async function findPeriodCalendar(token, config) {
  if (config.calendarId) {
    try {
      const cal = await gfetch(token, `/calendars/${encodeURIComponent(config.calendarId)}`);
      return cal.id;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  let pageToken = '';
  do {
    const page = await gfetch(token, `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${pageToken}` : ''}`);
    const hit = (page.items || []).find(c => c.summary === config.calendarName);
    if (hit) return hit.id;
    pageToken = page.nextPageToken;
  } while (pageToken);
  const created = await gfetch(token, '/calendars', {
    method: 'POST', body: JSON.stringify({ summary: config.calendarName }),
  });
  return created.id;
}

export async function listPeriodEvents(token, calendarId, timeMinIso, timeMaxIso) {
  const events = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      singleEvents: 'true', showDeleted: 'false', maxResults: '250',
      timeMin: timeMinIso, timeMax: timeMaxIso,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    for (const ev of page.items || []) {
      if (ev.status === 'cancelled') continue;
      const date = (ev.start?.date || ev.start?.dateTime || '').slice(0, 10);
      if (date) events.push({ id: ev.id, summary: ev.summary || '', date, updated: ev.updated });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

function nextDay(date) {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + 86400000);
  return d.toISOString().slice(0, 10);
}

export async function insertAllDayEvent(token, calendarId, summary, date) {
  const ev = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({ summary, start: { date }, end: { date: nextDay(date) } }),
  });
  return ev.id;
}

export async function patchEventDate(token, calendarId, eventId, date) {
  await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ start: { date }, end: { date: nextDay(date) } }),
  });
}

export async function deleteEvent(token, calendarId, eventId) {
  try {
    await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}
```

- [ ] **Step 3: Build check** — `npm run build` → OK (config import not wired yet; that's Task 8).

- [ ] **Step 4: Commit** (confirm `git status` does NOT list `src/sync-config.js` — it's gitignored)

```bash
git add src/gcal.js src/sync-config.example.js
git commit -m "Add Google Calendar REST client and sync config template"
```

---

### Task 7: OAuth PKCE flow

**Files:**
- Create: `src/auth.js`
- Modify: `android/app/build.gradle` (manifestPlaceholders), `android/app/src/main/AndroidManifest.xml` (intent-filter), `package.json` (deps)

**Interfaces:**
- Produces (consumed by Task 8):
  - `isSignedIn() -> Promise<boolean>`
  - `signIn(clientId) -> Promise<void>` (opens browser, resolves after token exchange)
  - `getAccessToken(clientId) -> Promise<string>` (auto-refresh; throws `AuthRequired` when re-consent needed)
  - `signOut() -> Promise<void>`
  - `class AuthRequired extends Error`

Google installed-app OAuth notes (verify against current docs at https://developers.google.com/identity/protocols/oauth2/native-app if anything 400s):
- Android client ids are PUBLIC (no secret). Redirect URI is the reversed client id as a custom scheme: `com.googleusercontent.apps.<CLIENT_ID_WITHOUT_SUFFIX>:/oauth2redirect`.
- Token endpoint refresh with a refresh_token needs only `client_id`, `refresh_token`, `grant_type=refresh_token`.
- `error=invalid_grant` on refresh means revoked → surface `AuthRequired`.

- [ ] **Step 1: Install deps** — `npm install @capacitor/browser @capacitor/preferences && npx cap sync android`

- [ ] **Step 2: Create `src/auth.js`:**

```js
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'cycle.gcal.tokens';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

export class AuthRequired extends Error {}

function redirectUri(clientId) {
  const reversed = 'com.googleusercontent.apps.' + clientId.replace('.apps.googleusercontent.com', '');
  return `${reversed}:/oauth2redirect`;
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

async function saveTokens(t) { await Preferences.set({ key: TOKEN_KEY, value: JSON.stringify(t) }); }
async function loadTokens() {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value ? JSON.parse(value) : null;
}

export async function isSignedIn() { return !!(await loadTokens()); }

export async function signOut() {
  const t = await loadTokens();
  if (t?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token)}`, { method: 'POST' }).catch(() => {});
  }
  await Preferences.remove({ key: TOKEN_KEY });
}

export async function signIn(clientId) {
  const { verifier, challenge } = await pkcePair();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(clientId),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const code = await new Promise((resolve, reject) => {
    let settled = false;
    const sub = App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('oauth2redirect')) return;
      settled = true;
      (await sub).remove();
      Browser.close().catch(() => {});
      const u = new URL(url.replace(/^[^:]+:\//, 'https://x/'));
      const c = u.searchParams.get('code');
      c ? resolve(c) : reject(new AuthRequired(u.searchParams.get('error') || 'denied'));
    });
    setTimeout(() => { if (!settled) reject(new AuthRequired('timeout')); }, 5 * 60 * 1000);
    Browser.open({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });
  const body = new URLSearchParams({
    client_id: clientId, code, code_verifier: verifier,
    grant_type: 'authorization_code', redirect_uri: redirectUri(clientId),
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new AuthRequired(tok.error || 'token exchange failed');
  await saveTokens({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  });
}

export async function getAccessToken(clientId) {
  const t = await loadTokens();
  if (!t) throw new AuthRequired('not signed in');
  if (Date.now() < t.expires_at) return t.access_token;
  const body = new URLSearchParams({
    client_id: clientId, refresh_token: t.refresh_token, grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) {
    await Preferences.remove({ key: TOKEN_KEY });
    throw new AuthRequired(tok.error || 'refresh failed');
  }
  const next = { ...t, access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000 };
  await saveTokens(next);
  return next.access_token;
}
```

- [ ] **Step 3: Android deep-link plumbing.** In `android/app/build.gradle`, inside `android { defaultConfig { … } }` add:

```gradle
        manifestPlaceholders = [oauthScheme: project.findProperty('OAUTH_SCHEME') ?: 'com.jade.cycle.unset']
```

In `android/app/src/main/AndroidManifest.xml`, inside the MainActivity `<activity>` element (alongside the existing intent-filter), add:

```xml
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${oauthScheme}" />
            </intent-filter>
```

(Jade sets `OAUTH_SCHEME=com.googleusercontent.apps.<id>` in `android/gradle.properties` during Task 9 — client ids for installed apps are public by design, safe to commit.)

- [ ] **Step 4: Build checks** — `npm run build`, then `npm run cap:sync`, then `cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add src/auth.js android/app/build.gradle android/app/src/main/AndroidManifest.xml package.json package-lock.json
git commit -m "Add OAuth PKCE flow and Android deep-link plumbing"
```

---

### Task 8: Sync orchestration + Settings UI

**Files:**
- Modify: `src/CycleApp.jsx`, `src/main.jsx`
- Create: `src/run-sync.js`

**Interfaces:**
- Consumes: everything from Tasks 5–7.
- Produces: `runSync({ periods, deletedEventIds, todayStr }) -> { periods, clearedTombstones, syncedAt }` (serialized entries in/out) in `src/run-sync.js`; UI states on the Settings sync row.

- [ ] **Step 1: Create `src/run-sync.js`** — the imperative glue (kept out of the component for clarity):

```js
import { getAccessToken } from './auth.js';
import { findPeriodCalendar, listPeriodEvents, insertAllDayEvent, patchEventDate, deleteEvent } from './gcal.js';
import { pairRemoteEvents, planSync } from './sync.js';
import { SYNC_CONFIG } from './sync-config.js';

function isoDate(d) { return d.toISOString().slice(0, 10); }

// periods in/out are SERIALIZED entries ({start: 'YYYY-MM-DD', ...}).
export async function runSync({ periods, deletedEventIds }) {
  const token = await getAccessToken(SYNC_CONFIG.clientId);
  const calendarId = await findPeriodCalendar(token, SYNC_CONFIG);

  const now = new Date();
  const todayStr = isoDate(now);
  const earliest = periods[0]?.start;
  const timeMin = earliest && earliest < isoDate(new Date(now.getTime() - 2 * 365 * 86400000))
    ? earliest : isoDate(new Date(now.getTime() - 2 * 365 * 86400000));
  const timeMax = isoDate(new Date(now.getTime() + 86400000)); // tomorrow: never pull future projections

  const events = await listPeriodEvents(token, calendarId, `${timeMin}T00:00:00Z`, `${timeMax}T00:00:00Z`);
  const remote = pairRemoteEvents(events, todayStr);
  const plan = planSync({ local: periods, remote, deletedEventIds, timeMin });

  for (const del of plan.pushDeletes) await deleteEvent(token, calendarId, del);
  for (const upd of plan.pushUpdates) await patchEventDate(token, calendarId, upd.eventId, upd.date);
  for (const create of plan.pushCreates) {
    const id = await insertAllDayEvent(token, calendarId,
      create.kind === 'start' ? 'period start' : 'period end', create.date);
    const entry = plan.localPeriods.find(e => e.start === create.localStart);
    if (entry) entry[create.kind === 'start' ? 'startEventId' : 'endEventId'] = id;
  }

  return { periods: plan.localPeriods, clearedTombstones: plan.clearedTombstones, syncedAt: new Date().toISOString() };
}
```

- [ ] **Step 2: Wire into `CycleApp`.** Replace the fake calendar-sync section in `SettingsSheet` and the `calSync`/`unsynced` plumbing:

State in `CycleApp`:

```js
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error | auth
  const [lastSyncedAt, setLastSyncedAt] = useState(initialLastSyncedAt);
  const [connected, setConnected] = useState(false);
  const syncBusy = useRef(false);
```

On mount (native only): `isSignedIn().then(setConnected)`.

The sync runner (uses serialize/parse to cross the string boundary):

```js
  const doSync = useCallback(async () => {
    if (!connected || syncBusy.current || !Capacitor.isNativePlatform()) return;
    syncBusy.current = true;
    setSyncStatus('syncing');
    try {
      const result = await runSync({
        periods: periods.map(serializeEntry),
        deletedEventIds,
      });
      setPeriods(sortEntries(result.periods.map(parseStoredEntry).filter(Boolean)));
      setDeletedEventIds(ids => ids.filter(id => !result.clearedTombstones.includes(id)));
      setLastSyncedAt(result.syncedAt);
      setSyncStatus('idle');
    } catch (e) {
      setSyncStatus(e instanceof AuthRequired ? 'auth' : 'error');
      if (e instanceof AuthRequired) setConnected(false);
    } finally {
      syncBusy.current = false;
    }
  }, [connected, periods, deletedEventIds]);
```

Triggers: `useEffect(() => { doSync(); }, [connected])` (on connect + mount) and a debounced effect on data changes:

```js
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(doSync, 5000);
    return () => clearTimeout(t);
  }, [periods, deletedEventIds, connected]);
```

Include `lastSyncedAt` in the `onSettingsChange` payload (replacing the Task 2 pass-through) so it persists.

Settings UI (replacing the `calSync` toggle block): native-only section —

- Disconnected: row "Google Calendar sync / Two-way sync with your Period Tracker calendar" + a Connect button that calls `signIn(SYNC_CONFIG.clientId).then(() => setConnected(true))`, catching `AuthRequired` to show an inline "Sign-in didn't complete" note.
- Connected: subtitle shows `Synced · <relative lastSyncedAt>` (or "Syncing…" / "Sync failed — will retry" / "Reconnect needed" per `syncStatus`), plus two text buttons: "Sync now" (`doSync`) and "Sign out" (`signOut().then(() => setConnected(false))`).
- On web builds render the row disabled with subtitle "Available in the Android app".

Remove the old `calSync`/`setCalSync`/`unsynced` code paths and the `Switch` usage for sync (keep the `Switch` component itself — dark mode may use it later). Repoint the top-of-screen chip: show it while `syncStatus === 'syncing'` with text "Syncing…", and on `error` show "Sync failed" briefly.

Also update the privacy footer text to: `Your data stays on this device\nand in your own Google Calendar.`

- [ ] **Step 3: Tests + build** — `npx vitest run` → PASS (no component tests exist; pure modules unaffected). `npm run build` → OK. `npm run cap:sync && cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug --no-daemon` → BUILD SUCCESSFUL.

- [ ] **Step 4: Runtime verify what's verifiable without credentials (browser):** Settings shows the disabled "Available in the Android app" sync row on web; import/export still work; no console errors. On the emulator: the Connect button appears; tapping it with the placeholder client id opens the browser to a Google error page — that's the expected pre-setup behavior; back out cleanly, app doesn't crash.

- [ ] **Step 5: Commit**

```bash
git add src/CycleApp.jsx src/main.jsx src/run-sync.js
git commit -m "Wire real two-way Google Calendar sync into settings"
```

---

### Task 9: Jade's setup doc + live verification

**Files:**
- Create: `docs/google-cloud-setup.md`

- [ ] **Step 1: Write `docs/google-cloud-setup.md`:**

```markdown
# One-time Google Cloud setup for Cycle sync (~10 min)

1. Get the debug signing SHA-1 (run on the dev machine):
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep 'SHA1'
2. https://console.cloud.google.com → New project → name "cycle-sync".
3. APIs & Services → Library → "Google Calendar API" → Enable.
4. APIs & Services → OAuth consent screen → External → app name "Cycle",
   your email for both contacts → Save. Under Audience / Test users →
   Add users → jadewang@gmail.com. (Stay in "Testing" mode — no
   verification needed; refresh tokens for test users expire after ~7 days
   of non-use, which normal usage avoids.)
5. APIs & Services → Credentials → Create credentials → OAuth client ID →
   Application type: Android → package name `com.jade.cycle` →
   paste the SHA-1 from step 1 → Create. Copy the client id
   (`NNNN-xxxx.apps.googleusercontent.com`).
6. In the repo:
   - `src/sync-config.js` → set `clientId` to the copied id.
   - `android/gradle.properties` → add line:
     `OAUTH_SCHEME=com.googleusercontent.apps.NNNN-xxxx`
     (the client id with `.apps.googleusercontent.com` removed, prefixed
     as shown — this must match `redirectUri()` in `src/auth.js`).
7. Rebuild + install: `npm run cap:sync && cd android && ./gradlew assembleDebug`,
   then install `android/app/build/outputs/apk/debug/app-debug.apk` on the phone
   (`adb install -r …` with USB debugging, or copy the file over).
8. In the app: Settings → Import data → paste the contents of
   `period-import.json` (repo root on the dev machine) → Import.
9. Settings → Connect Google Calendar → sign in as jadewang@gmail.com.
10. After the first successful sync, open Google Calendar and END both
    recurring series so projections stop accumulating: open any future
    "period start" instance → Edit series (this and following) → set
    "Ends on" to today. Repeat for "period end". The app's own
    prediction replaces these projections.
```

- [ ] **Step 2: Live verification checklist (requires Jade's phone + credentials; run through it with her, capture adb screenshots where possible):**
1. Import seed → 40 entries.
2. Connect → Google consent screen → back in app, "Synced ·" appears; her calendar gains NO new events (all 40 entries linked by id — verify a couple of entries' event ids in the exported JSON match calendar event ids).
3. Log a period in the app (e.g. backdate 2 days) → within ~5 s a standalone "period start" event appears in Google Calendar on that date.
4. Set its end date in the app → "period end" event appears.
5. Move a past "period start" event in Google Calendar by one day → Sync now in app → entry's date updates.
6. Delete the test entry in the app → both events disappear from the calendar.
7. Kill + relaunch the app → data intact, sync reconnects silently.

- [ ] **Step 3: Commit**

```bash
git add docs/google-cloud-setup.md
git commit -m "Add Google Cloud OAuth setup guide"
git push
```

---

## Handoff notes (from the planning session, 2026-07-02)

- `period-import.json` already exists at the repo root (gitignored): 40 entries, 39 with ends, event ids included, June 28 2026 entry confirmed REAL by Jade. Do not regenerate; do not commit.
- The dev machine already has: Android SDK at `~/Android/Sdk` (platform 36, emulator AVD `cycle-test`), JDK 21, gradle caches warm. KVM works.
- Jade's calendar quirk (recurring projections) is REAL and verified — the `timeMax = tomorrow` rule and `pairRemoteEvents` future-filter are load-bearing; do not "optimize" them away.
- Existing test count before this plan: 11 passing in `src/CycleApp.test.js`. Tasks 1–2 intentionally replace 6 of them (plain-Date model) with entry-model equivalents.
- The repo pushes to `github.com:jadeqwang/cycle` (SSH, gh authenticated).
```
