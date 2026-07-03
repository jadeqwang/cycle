# GCal Scope Narrowing + Calendar Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broad `calendar.events` + `calendar.readonly` OAuth scopes with three granular scopes, and replace the hardcoded "Period Tracker" calendar config with a user-facing calendar picker (choose an owned calendar, or create one).

**Architecture:** `src/auth.js` requests the narrowed scopes and stamps stored tokens with the scope string, so a scope change forces a clean re-consent (legacy tokens have no stamp → `AuthRequired` → the existing "Reconnect needed" UI). `src/gcal.js` swaps `findPeriodCalendar` (get-by-id / search-by-name / auto-create) for `listOwnedCalendars` + `createCalendar`. A new `src/calendar-choice.js` persists the user's calendar choice on-device (seeded once from legacy `sync-config.js` fields so existing installs never see the picker). `src/run-sync.js` takes `calendarId` as a parameter. `src/CycleApp.jsx` gains the picker UI and clears the stale "Sign-in didn't complete" label on success.

**Tech Stack:** React 18 + Vite + Capacitor 7 (Android), vitest, Google Calendar REST v3, OAuth 2.0 PKCE.

## Global Constraints

- **New scopes (exact, space-joined, this order):**
  `https://www.googleapis.com/auth/calendar.events.owned` (event CRUD on calendars the user owns), `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (list calendars for the picker), `https://www.googleapis.com/auth/calendar.app.created` (create the optional new calendar). All three verified against Google's method reference docs on 2026-07-03: `calendarList.list` accepts `calendar.calendarlist.readonly`; `events.list/insert/patch/delete` accept `calendar.events.owned`; `calendars.insert` accepts `calendar.app.created`.
- `period-import.json` and `src/sync-config.js` are gitignored: **never commit them, never paste their contents into chat, logs, or committed files.** Jade's local `sync-config.js` contains the real client id and legacy `calendarId`/`calendarName` fields — do not delete those legacy fields from her local file; the seeding logic in Task 3 consumes them.
- The projection guard (`timeMax` = local tomorrow in `src/run-sync.js`; `pairRemoteEvents` filter in `src/sync.js`) is load-bearing. Do not touch it.
- **Calendar-switch safety:** `planSync` (src/sync.js:114-119) DROPS local entries whose `startEventId` is not found remotely. Changing calendars without stripping stored event ids silently deletes history. Task 5's `stripEventIds` on switch is load-bearing, not hygiene. Re-pairing is safe because `planSync` matches id-less entries by date (src/sync.js:73-76) and `runSync`'s `timeMin` extends to the earliest local entry.
- Baseline before this plan: 52 tests passing (`npx vitest run`), `npm run build` clean, on `main` (53b5e99 or later).
- Start from `main` (`git checkout main && git pull`), create branch `gcal-scope-narrowing` (in a worktree per superpowers:using-git-worktrees if isolating).
- **Do not run two agents/sessions that write this working tree at once.** If files are handed off between sessions, the incoming session must re-read them from disk.

## Known deferred items (do NOT implement; listed so they aren't "discovered" as bugs)

- Entry deleted while a sync is in flight is resurrected (tombstones cleared unconditionally by `planSync`). Accepted.
- Render-phase ref writes in `CycleApp.jsx` (`periodsRef.current = periods` in the component body). Accepted idiom — the new `calendarChoiceRef` follows it.
- Changing calendars while a sync is in flight is blocked by a UI guard (picker disabled while `syncStatus === 'syncing'`), not by a queue. Accepted.
- Events left behind in the previously chosen calendar after a switch are intentionally untouched (the app never deletes from a calendar it no longer syncs).

---

### Task 1: Narrow scopes + scope-stamped tokens (`src/auth.js`)

**Files:**
- Modify: `src/auth.js` (lines 6, 102-107, 109-112)
- Test: `src/auth.test.js` (create)

**Interfaces:**
- Produces: exported `SCOPE` string constant (space-joined three scopes); `getAccessToken(clientId)` now throws `AuthRequired('scope changed')` and clears stored tokens when the stored token's `scope` field ≠ `SCOPE` (legacy tokens have no `scope` field, so every existing install re-consents once). Task 5 relies on this: the existing `AuthRequired` catch in `doSync` already flips the UI to "Reconnect needed".
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Create `src/auth.test.js`:

```js
import { beforeEach, describe, expect, test, vi } from 'vitest';

const store = new Map();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }) => ({ value: store.has(key) ? store.get(key) : null })),
    set: vi.fn(async ({ key, value }) => { store.set(key, value); }),
    remove: vi.fn(async ({ key }) => { store.delete(key); }),
  },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: { open: vi.fn(async () => {}), close: vi.fn(async () => {}) },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event, cb) => {
      setTimeout(() => cb({ url: 'com.googleusercontent.apps.test:/oauth2redirect?code=auth-code-1' }), 0);
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

const { SCOPE, AuthRequired, getAccessToken, signIn } = await import('./auth.js');
const TOKEN_KEY = 'cycle.gcal.tokens';

describe('SCOPE', () => {
  test('requests exactly the three granular scopes', () => {
    expect(SCOPE.split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.owned',
    ]);
  });
});

describe('getAccessToken scope stamping', () => {
  beforeEach(() => { store.clear(); });

  test('legacy tokens without a scope stamp are cleared and force re-consent', async () => {
    store.set(TOKEN_KEY, JSON.stringify({
      access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000,
    }));
    await expect(getAccessToken('client-1')).rejects.toBeInstanceOf(AuthRequired);
    expect(store.has(TOKEN_KEY)).toBe(false);
  });

  test('tokens stamped with a different scope are cleared and force re-consent', async () => {
    store.set(TOKEN_KEY, JSON.stringify({
      access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar.events',
    }));
    await expect(getAccessToken('client-1')).rejects.toBeInstanceOf(AuthRequired);
    expect(store.has(TOKEN_KEY)).toBe(false);
  });

  test('tokens stamped with the current scope pass through', async () => {
    store.set(TOKEN_KEY, JSON.stringify({
      access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600000, scope: SCOPE,
    }));
    await expect(getAccessToken('client-1')).resolves.toBe('a');
  });
});

describe('signIn', () => {
  beforeEach(() => { store.clear(); });

  test('stamps saved tokens with the current SCOPE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 }),
    })));
    await signIn('test.apps.googleusercontent.com');
    const saved = JSON.parse(store.get(TOKEN_KEY));
    expect(saved.scope).toBe(SCOPE);
    expect(saved.access_token).toBe('at-1');
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/auth.test.js`
Expected: FAIL — `SCOPE` is not exported (SyntaxError or undefined), and the legacy/mismatch tests fail because `getAccessToken` returns `'a'` instead of throwing.

- [ ] **Step 3: Implement**

In `src/auth.js`, replace line 6:

```js
export const SCOPE = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
].join(' ');
```

In `signIn`, stamp the saved tokens (the `saveTokens` call near line 102):

```js
  await saveTokens({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
    scope: SCOPE,
  });
```

In `getAccessToken`, add the stamp check immediately after the null check (line 111):

```js
  const tokens = await loadTokens();
  if (!tokens) throw new AuthRequired('not signed in');
  if (tokens.scope !== SCOPE) {
    await Preferences.remove({ key: TOKEN_KEY });
    throw new AuthRequired('scope changed');
  }
```

(The refresh path near line 126 spreads `...tokens`, so the stamp survives refreshes — no change needed there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/auth.test.js`
Expected: 5 passed. Then `npx vitest run` → 57 passed (52 + 5).

- [ ] **Step 5: Commit**

```bash
git add src/auth.js src/auth.test.js
git commit -m "Narrow OAuth to granular calendar scopes with scope-stamped tokens"
```

### Task 2: Calendar list + create in the REST client (`src/gcal.js`)

**Files:**
- Modify: `src/gcal.js` (delete `findPeriodCalendar`, lines 26-49; add two functions)
- Test: `src/gcal.test.js` (create)

**Interfaces:**
- Produces: `listOwnedCalendars(token)` → `Promise<Array<{id, summary, primary}>>` (only calendars the user owns, paginated); `createCalendar(token, summary)` → `Promise<{id, summary, primary: false}>`. Both throw `GcalError` on non-2xx.
- Consumes: existing private `gfetch` helper.
- **Removes:** `findPeriodCalendar` — Task 4 removes its one caller; do not leave a dead export.

- [ ] **Step 1: Write the failing tests**

Create `src/gcal.test.js`:

```js
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GcalError, listOwnedCalendars, createCalendar } from './gcal.js';

afterEach(() => vi.unstubAllGlobals());

function fetchStub(responses) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    calls.push({ url, options });
    const next = responses.shift();
    return { ok: next.status < 300, status: next.status, json: async () => next.body, text: async () => JSON.stringify(next.body) };
  }));
  return calls;
}

describe('listOwnedCalendars', () => {
  test('paginates, requests owner access, and maps fields', async () => {
    const calls = fetchStub([
      { status: 200, body: { items: [{ id: 'cal-1', summary: 'Period Tracker' }], nextPageToken: 'p2' } },
      { status: 200, body: { items: [{ id: 'cal-2', summary: 'jade@example.com', primary: true }] } },
    ]);
    const cals = await listOwnedCalendars('tok');
    expect(cals).toEqual([
      { id: 'cal-1', summary: 'Period Tracker', primary: false },
      { id: 'cal-2', summary: 'jade@example.com', primary: true },
    ]);
    expect(calls[0].url).toContain('/users/me/calendarList?minAccessRole=owner');
    expect(calls[1].url).toContain('pageToken=p2');
  });

  test('throws GcalError on failure', async () => {
    fetchStub([{ status: 403, body: { error: 'nope' } }]);
    await expect(listOwnedCalendars('tok')).rejects.toBeInstanceOf(GcalError);
  });
});

describe('createCalendar', () => {
  test('POSTs the summary and returns the new calendar', async () => {
    const calls = fetchStub([{ status: 200, body: { id: 'new-cal', summary: 'Cycle' } }]);
    const cal = await createCalendar('tok', 'Cycle');
    expect(cal).toEqual({ id: 'new-cal', summary: 'Cycle', primary: false });
    expect(calls[0].url).toContain('/calendars');
    expect(calls[0].options.method).toBe('POST');
    expect(JSON.parse(calls[0].options.body)).toEqual({ summary: 'Cycle' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/gcal.test.js`
Expected: FAIL — `listOwnedCalendars` / `createCalendar` are not exported.

- [ ] **Step 3: Implement**

In `src/gcal.js`, delete `findPeriodCalendar` (lines 26-49) and add:

```js
export async function listOwnedCalendars(token) {
  const calendars = [];
  let pageToken = '';
  do {
    const page = await gfetch(token, `/users/me/calendarList?minAccessRole=owner&maxResults=250${pageToken ? `&pageToken=${pageToken}` : ''}`);
    for (const cal of page.items || []) {
      calendars.push({ id: cal.id, summary: cal.summaryOverride || cal.summary || '', primary: !!cal.primary });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return calendars;
}

export async function createCalendar(token, summary) {
  const created = await gfetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
  return { id: created.id, summary: created.summary || summary, primary: false };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/gcal.test.js`
Expected: 3 passed. (`npx vitest run` will FAIL right now — `run-sync.js` still imports `findPeriodCalendar`. That is expected; Task 4 fixes it. Do NOT run the full suite as a gate here.)

- [ ] **Step 5: Commit**

```bash
git add src/gcal.js src/gcal.test.js
git commit -m "Replace findPeriodCalendar with listOwnedCalendars + createCalendar"
```

### Task 3: On-device calendar choice with legacy seeding (`src/calendar-choice.js`)

**Files:**
- Create: `src/calendar-choice.js`
- Modify: `src/sync-config.example.js`
- Test: `src/calendar-choice.test.js` (create)

**Interfaces:**
- Produces: `loadCalendarChoice(legacyConfig)` → `Promise<{id, summary} | null>` (stored choice wins; else seeds once from `legacyConfig.calendarId`/`calendarName` and persists the seed; else `null`); `saveCalendarChoice({id, summary})`; `clearCalendarChoice()`. Storage key: `cycle.gcal.calendar` (Capacitor Preferences, JSON).
- Consumes: `SYNC_CONFIG` is passed in by the caller (Task 5) — this module does NOT import `sync-config.js`, so tests need no config mock.

- [ ] **Step 1: Write the failing tests**

Create `src/calendar-choice.test.js`:

```js
import { beforeEach, describe, expect, test, vi } from 'vitest';

const store = new Map();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }) => ({ value: store.has(key) ? store.get(key) : null })),
    set: vi.fn(async ({ key, value }) => { store.set(key, value); }),
    remove: vi.fn(async ({ key }) => { store.delete(key); }),
  },
}));

const { loadCalendarChoice, saveCalendarChoice, clearCalendarChoice } = await import('./calendar-choice.js');
const KEY = 'cycle.gcal.calendar';

describe('calendar choice', () => {
  beforeEach(() => store.clear());

  test('returns the stored choice, ignoring legacy config', async () => {
    store.set(KEY, JSON.stringify({ id: 'stored-cal', summary: 'Stored' }));
    const choice = await loadCalendarChoice({ calendarId: 'legacy-cal', calendarName: 'Legacy' });
    expect(choice).toEqual({ id: 'stored-cal', summary: 'Stored' });
  });

  test('seeds from legacy config once and persists the seed', async () => {
    const choice = await loadCalendarChoice({ calendarId: 'legacy-cal', calendarName: 'Period Tracker' });
    expect(choice).toEqual({ id: 'legacy-cal', summary: 'Period Tracker' });
    expect(JSON.parse(store.get(KEY))).toEqual({ id: 'legacy-cal', summary: 'Period Tracker' });
  });

  test('returns null with nothing stored and no legacy config', async () => {
    expect(await loadCalendarChoice({})).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  test('save and clear round-trip', async () => {
    await saveCalendarChoice({ id: 'c1', summary: 'Cycle', primary: false });
    expect(JSON.parse(store.get(KEY))).toEqual({ id: 'c1', summary: 'Cycle' });
    await clearCalendarChoice();
    expect(store.has(KEY)).toBe(false);
  });

  test('corrupt stored JSON falls back to legacy seeding', async () => {
    store.set(KEY, '{not json');
    const choice = await loadCalendarChoice({ calendarId: 'legacy-cal', calendarName: 'Legacy' });
    expect(choice).toEqual({ id: 'legacy-cal', summary: 'Legacy' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/calendar-choice.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/calendar-choice.js`:

```js
import { Preferences } from '@capacitor/preferences';

const CHOICE_KEY = 'cycle.gcal.calendar';

export async function saveCalendarChoice(choice) {
  await Preferences.set({
    key: CHOICE_KEY,
    value: JSON.stringify({ id: choice.id, summary: choice.summary }),
  });
}

export async function clearCalendarChoice() {
  await Preferences.remove({ key: CHOICE_KEY });
}

// Stored choice wins. Otherwise seed once from the legacy sync-config fields
// (pre-picker installs) so existing users never see the picker unprompted.
export async function loadCalendarChoice(legacyConfig = {}) {
  const { value } = await Preferences.get({ key: CHOICE_KEY });
  if (value) {
    try { return JSON.parse(value); } catch { /* corrupt — fall through to seeding */ }
  }
  if (legacyConfig.calendarId) {
    const seeded = { id: legacyConfig.calendarId, summary: legacyConfig.calendarName || 'Calendar' };
    await saveCalendarChoice(seeded);
    return seeded;
  }
  return null;
}
```

- [ ] **Step 4: Slim the config template**

Replace `src/sync-config.example.js` content with:

```js
// Copy to src/sync-config.js (gitignored) and fill in your OAuth client id.
export const SYNC_CONFIG = {
  // OAuth 2.0 client id, type "Android", from Google Cloud Console.
  clientId: 'REPLACE_ME.apps.googleusercontent.com',
  // Legacy (optional): pre-picker installs may still carry calendarId /
  // calendarName here; they seed the on-device calendar choice once and can
  // be deleted after the first run. New installs should not set them —
  // the in-app calendar picker is the source of truth.
};
```

Do NOT edit the gitignored `src/sync-config.js` — its legacy fields are the seed for Jade's install.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/calendar-choice.test.js`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/calendar-choice.js src/calendar-choice.test.js src/sync-config.example.js
git commit -m "Store the sync calendar choice on-device, seeded from legacy config"
```

### Task 4: `runSync` takes the calendar id as a parameter (`src/run-sync.js`)

**Files:**
- Modify: `src/run-sync.js` (lines 2-8 import, 33-35)
- Test: `src/run-sync.test.js` (modify: mock block lines 7-19, config mock lines 21-27, every `runSync(...)` call)

**Interfaces:**
- Produces: `runSync({ periods, deletedEventIds, calendarId, todayStr })` — throws `Error('runSync requires a calendarId')` if `calendarId` is falsy. No longer reads `calendarId`/`calendarName` from `SYNC_CONFIG` (still reads `clientId`).
- Consumes: Task 2's gcal module shape (no `findPeriodCalendar`).

- [ ] **Step 1: Update the tests to the new signature (failing)**

In `src/run-sync.test.js`:
1. Remove `findPeriodCalendar: vi.fn(async () => 'calendar-1'),` from the `./gcal.js` mock.
2. In the `./sync-config.js` mock, remove `calendarName` and `calendarId` (keep `clientId`).
3. Add `calendarId: 'calendar-1'` to the argument object of every existing `runSync({ ... })` call.
4. Add one new test at the end of the describe block:

```js
  test('throws without a calendarId', async () => {
    await expect(runSync({ periods: [], deletedEventIds: [] }))
      .rejects.toThrow('runSync requires a calendarId');
  });
```

- [ ] **Step 2: Run to verify current code fails the new tests**

Run: `npx vitest run src/run-sync.test.js`
Expected: FAIL — `run-sync.js` imports `findPeriodCalendar`, which the trimmed mock no longer provides.

- [ ] **Step 3: Implement**

In `src/run-sync.js`: remove `findPeriodCalendar` from the import (lines 2-8), then replace lines 33-35:

```js
export async function runSync({ periods, deletedEventIds, calendarId, todayStr = localDateString(new Date()) }) {
  if (!calendarId) throw new Error('runSync requires a calendarId');
  const token = await getAccessToken(SYNC_CONFIG.clientId);
```

(Every later use of `calendarId` in the function already refers to the local name — no other changes.)

- [ ] **Step 4: Run the FULL suite**

Run: `npx vitest run`
Expected: 66 passed (52 baseline + 5 auth + 3 gcal + 5 calendar-choice + 1 run-sync). The Task 2 breakage is resolved now that nothing imports `findPeriodCalendar`.

- [ ] **Step 5: Commit**

```bash
git add src/run-sync.js src/run-sync.test.js
git commit -m "Pass the sync calendar id into runSync explicitly"
```

### Task 5: Calendar picker UI + wiring + sign-in label fix (`src/CycleApp.jsx`)

**Files:**
- Modify: `src/CycleApp.jsx` (imports ~7-9; `syncSubtitle` 68-80; `SettingsSheet` props/JSX 598-707; app state/effects 1019-1142)
- Test: `src/CycleApp.test.js` (extend — helper-level tests only, matching the repo's no-render test idiom)

**Interfaces:**
- Consumes: `SCOPE`-stamped `getAccessToken` (Task 1, via `runSync`/direct import), `listOwnedCalendars`/`createCalendar` (Task 2), `loadCalendarChoice`/`saveCalendarChoice` (Task 3), `runSync({ ..., calendarId })` (Task 4).
- Produces: exported pure helper `stripEventIds(periods)`; `syncSubtitle` gains a `calendarChosen` flag. Both are what Task 5's tests cover; the JSX is verified in Tasks 6-7.

- [ ] **Step 1: Write the failing helper tests**

In `src/CycleApp.test.js`, add `stripEventIds` to the import list from `./CycleApp.jsx`, then append:

```js
describe('stripEventIds', () => {
  test('nulls event ids on every entry without touching other fields', () => {
    const periods = [
      entry('2026-06-01', { end: '2026-06-05', startEventId: 'a', endEventId: 'b' }),
      entry('2026-06-28', { startEventId: 'c' }),
    ];
    const stripped = stripEventIds(periods);
    expect(stripped).toEqual([
      entry('2026-06-01', { end: '2026-06-05' }),
      entry('2026-06-28'),
    ]);
    expect(periods[0].startEventId).toBe('a'); // input not mutated
  });
});

describe('syncSubtitle calendar choice', () => {
  test('prompts for a calendar when connected without one', () => {
    expect(syncSubtitle({
      native: true, connected: true, syncStatus: 'idle', lastSyncedAt: null, calendarChosen: false,
    })).toBe('Choose a calendar to sync');
    expect(syncSubtitle({
      native: true, connected: true, syncStatus: 'idle', lastSyncedAt: null, calendarChosen: true,
    })).toBe('Connected');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/CycleApp.test.js`
Expected: FAIL — `stripEventIds` not exported; subtitle returns `'Connected to Period Tracker'` instead of the two new strings.

- [ ] **Step 3: Implement the helpers**

In `src/CycleApp.jsx`, add near the other exported helpers:

```js
export function stripEventIds(periods) {
  return periods.map(entry => ({ ...entry, startEventId: null, endEventId: null }));
}
```

Update `syncSubtitle` (line 68) — new flag, and the two copy strings lose their hardcoded calendar name:

```js
function syncSubtitle({ native, connected, syncStatus, lastSyncedAt, calendarChosen = true }) {
  if (!native) return 'Available in the Android app';
  if (syncStatus === 'auth') return 'Reconnect needed';
  if (!connected) return 'Two-way sync with your Google Calendar';
  if (!calendarChosen) return 'Choose a calendar to sync';
  if (syncStatus === 'syncing') return 'Syncing…';
  if (syncStatus === 'error') return 'Sync failed — will retry';
  if (!lastSyncedAt) return 'Connected';
  // ... existing date formatting unchanged
```

Note: `syncSubtitle` is exported and existing tests pin the OLD copy `'Two-way sync with your Period Tracker calendar'` and `'Connected to Period Tracker'` — update those two expectations in `src/CycleApp.test.js` to the new strings.

- [ ] **Step 4: Run helper tests**

Run: `npx vitest run src/CycleApp.test.js`
Expected: PASS (including the two updated copy expectations).

- [ ] **Step 5: Wire state, sync, and the label fix**

All in `src/CycleApp.jsx`. Imports (top of file):

```js
import { AuthRequired, getAccessToken, isSignedIn, signIn, signOut } from './auth.js';
import { listOwnedCalendars, createCalendar } from './gcal.js';
import { loadCalendarChoice, saveCalendarChoice } from './calendar-choice.js';
```

State + ref (next to the existing sync state, ~line 1019):

```js
  const [calendarChoice, setCalendarChoice] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCalendars, setPickerCalendars] = useState(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const calendarChoiceRef = useRef(null);
  calendarChoiceRef.current = calendarChoice;
```

Load the stored/seeded choice on mount (next to the `isSignedIn` effect, ~line 1043):

```js
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    loadCalendarChoice(SYNC_CONFIG)
      .then(choice => { if (!cancelled) setCalendarChoice(choice); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [native]);
```

`doSync` (~line 1059): guard on the choice and pass it through; clear the sign-in label on success:

```js
    const choice = calendarChoiceRef.current;
    if (!choice) return;                       // before setSyncStatus('syncing')
    ...
      const result = await runSync({
        periods: snapshot,
        deletedEventIds: deletedEventIdsRef.current,
        calendarId: choice.id,
      });
      ...
      setSignInError(false);                   // in the success path, next to setSyncStatus('idle')
```

Also clear the label whenever a connection lands (new effect — this is the bundled bug fix):

```js
  useEffect(() => {
    if (connected) setSignInError(false);
  }, [connected]);
```

Trigger a sync when the choice changes: add `calendarChoice` to the existing 5s data-change effect deps (line 1110-1114):

```js
  useEffect(() => {
    if (!connected) return undefined;
    const timer = setTimeout(doSync, 5000);
    return () => clearTimeout(timer);
  }, [periods, deletedEventIds, connected, calendarChoice, doSync]);
```

Picker handlers (next to `handleConnect`, ~line 1125):

```js
  const openPicker = useCallback(async () => {
    if (pickerBusy) return;
    setPickerBusy(true);
    setPickerError(null);
    try {
      const token = await getAccessToken(SYNC_CONFIG.clientId);
      setPickerCalendars(await listOwnedCalendars(token));
      setPickerOpen(true);
    } catch (error) {
      if (error instanceof AuthRequired) {
        setConnected(false);
        setSyncStatus('auth');
      } else {
        setPickerError("Couldn't load your calendars.");
        setPickerOpen(true);
      }
    } finally {
      setPickerBusy(false);
    }
  }, [pickerBusy]);

  const handleChooseCalendar = useCallback(async (cal) => {
    if (syncBusy.current) {
      setPickerError('Wait for the current sync to finish.');
      return;
    }
    const prev = calendarChoiceRef.current;
    if (prev && prev.id !== cal.id) {
      // Event ids belong to the previous calendar; without this, planSync
      // treats every entry as remotely deleted and drops it (sync.js:114).
      setPeriods(prevPeriods => stripEventIds(prevPeriods));
    }
    const choice = { id: cal.id, summary: cal.summary };
    await saveCalendarChoice(choice).catch(() => {});
    setCalendarChoice(choice);
    setPickerOpen(false);
    setPickerError(null);
  }, []);

  const handleCreateCalendar = useCallback(async () => {
    if (pickerBusy || syncBusy.current) return;
    setPickerBusy(true);
    setPickerError(null);
    try {
      const token = await getAccessToken(SYNC_CONFIG.clientId);
      const created = await createCalendar(token, 'Cycle');
      await handleChooseCalendar(created);
    } catch {
      setPickerError("Couldn't create the calendar.");
    } finally {
      setPickerBusy(false);
    }
  }, [pickerBusy, handleChooseCalendar]);
```

Auto-open the picker for connected users with no choice (fresh installs):

```js
  useEffect(() => {
    if (connected && !calendarChoice && settingsOpen) openPicker();
  }, [connected, calendarChoice, settingsOpen, openPicker]);
```

- [ ] **Step 6: Picker JSX in `SettingsSheet`**

Add to `SettingsSheet`'s props (line 598-607): `calendarChoice, pickerOpen, pickerCalendars, pickerBusy, pickerError, onOpenPicker, onChooseCalendar, onCreateCalendar, onClosePicker` — and pass them all from the app render. Compute the subtitle with the flag: `syncSubtitle({ native, connected, syncStatus, lastSyncedAt, calendarChosen: !!calendarChoice })`.

Replace the static calendar row (lines 690-706) — it now shows the chosen calendar and opens the picker:

```jsx
            {connected && (
              <button onClick={onOpenPicker} style={{
                marginTop: 14, width: '100%', textAlign: 'left',
                background: c.surface, border: 'none', borderRadius: 14, padding: '14px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: c.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Cal c={c.accentDeep}/>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: c.textPrimary }}>Calendar</div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: c.textSecondary }}>
                      {calendarChoice ? calendarChoice.summary : 'Choose a calendar'}
                    </div>
                  </div>
                </div>
                <ChevronRight c={c.textFaint} s={16}/>
              </button>
            )}
            {connected && pickerOpen && (
              <div style={{ marginTop: 10, background: c.surface, borderRadius: 14, padding: '6px 8px 10px' }}>
                {(pickerCalendars || []).map(cal => (
                  <button key={cal.id} onClick={() => onChooseCalendar(cal)} disabled={pickerBusy} style={{
                    width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '12px 8px', borderRadius: 10, cursor: pickerBusy ? 'default' : 'pointer',
                    fontFamily: 'var(--font-ui)', fontSize: 14,
                    color: calendarChoice?.id === cal.id ? c.accentDeep : c.textPrimary,
                    fontWeight: calendarChoice?.id === cal.id ? 600 : 400,
                  }}>
                    {cal.summary}{cal.primary ? ' · main calendar' : ''}{calendarChoice?.id === cal.id ? '  ✓' : ''}
                  </button>
                ))}
                <button onClick={onCreateCalendar} disabled={pickerBusy} style={{
                  width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                  padding: '12px 8px', borderRadius: 10, cursor: pickerBusy ? 'default' : 'pointer',
                  fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: c.accentDeep,
                }}>
                  + Create a “Cycle” calendar
                </button>
                {pickerError && (
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: c.accentDeep, padding: '4px 8px' }}>
                    {pickerError}
                  </div>
                )}
                {calendarChoice && (
                  <button onClick={onClosePicker} style={{
                    width: '100%', textAlign: 'center', border: 'none', background: 'transparent',
                    padding: '10px 8px 4px', fontFamily: 'var(--font-ui)', fontSize: 13, color: c.textSecondary, cursor: 'pointer',
                  }}>
                    Cancel
                  </button>
                )}
              </div>
            )}
```

(`onClosePicker` in the app is just `() => setPickerOpen(false)`. `ChevronRight` and `Cal` already exist in the file.)

- [ ] **Step 7: Full suite + build**

Run: `npx vitest run` → all pass. Run: `npm run build` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/CycleApp.jsx src/CycleApp.test.js
git commit -m "Add calendar picker, per-choice sync, and sign-in label clearing"
```

### Task 6: Docs + emulator smoke test

**Files:**
- Modify: `docs/google-cloud-setup.md`
- None else — emulator half is observational.

- [ ] **Step 1: Update the setup doc**

In `docs/google-cloud-setup.md`, replace step 8's mention if any of calendar config is present (verify with `grep -n calendarId docs/google-cloud-setup.md` — currently none, so no change there), and append after step 10:

```markdown

## Scopes note (2026-07)

The app requests three granular Calendar scopes instead of broad calendar
access: `calendar.events.owned` (events on calendars you own),
`calendar.calendarlist.readonly` (list your calendars for the picker), and
`calendar.app.created` (create a new "Cycle" calendar if you want one).
While the OAuth consent screen is in Testing mode nothing needs to change in
the Cloud console; optionally add these three under Data Access → Scopes for
documentation. After updating the app, it will show "Reconnect needed" once —
that re-consent is expected (the old token carried the old scopes).
```

- [ ] **Step 2: Emulator smoke test (no credentials)**

```bash
npm run cap:sync
cd android && ANDROID_HOME=$HOME/Android/Sdk ANDROID_SDK_ROOT=$HOME/Android/Sdk ./gradlew assembleDebug --no-daemon && cd ..
~/Android/Sdk/emulator/emulator -avd cycle-test -no-snapshot-save &
~/Android/Sdk/platform-tools/adb wait-for-device
~/Android/Sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
~/Android/Sdk/platform-tools/adb shell monkey -p com.jade.cycle 1
```

Checks (screenshots via `adb exec-out screencap -p > /tmp/claude/scope-shot-N.png`):
1. Settings → sync row shows **Connect** (emulator has no stored tokens; picker must NOT appear while disconnected).
2. Tap Connect → browser opens to a Google sign-in page (the dev machine's real `sync-config.js` is baked into the build, but the emulator has no Google account — do NOT sign in there); back out → no crash, row still disconnected.
3. Log a period, force-stop, relaunch → persisted.

- [ ] **Step 3: Record + commit**

Append `> Task 6 verified YYYY-MM-DD: <notes>` under this task.

```bash
git add docs/
git commit -m "Document narrowed OAuth scopes and record emulator smoke test"
```

### Task 7: Live verification — **[Jade + agent, her phone + her calendar]**

**Files:** none; observational. Record results under this task.

**Safety property under test:** re-consent + picker migration must not create, move, or delete anything in her existing calendar, and entries must survive the calendar-id migration byte-for-byte.

- [ ] 1. Before installing: export a backup from the phone app (Settings → Export) so there's a restore point. **Jade holds it; not pasted anywhere.**
- [ ] 2. Build + `adb install -r` on her phone (serial `37191FDHS000E5`; if the emulator is running, use `adb -s 37191FDHS000E5 install -r …`).
- [ ] 3. Launch → sync row shows **"Reconnect needed"** (old token lacks the scope stamp). History unchanged (all entries intact).
- [ ] 4. Connect → Google consent screen lists ONLY the three narrow permissions (wording like "See, create, change and delete events on calendars you own", "See the list of Google calendars you're subscribed to", "Make secondary Google calendars…"). **If it shows "See and download any calendar" the scope change didn't take — stop, systematic-debugging.**
- [ ] 5. After consent: NO picker appears (choice was seeded from her legacy config); Calendar row shows "Period Tracker"; subtitle reaches "Synced · today". Her calendar gains no events; no duplicates.
- [ ] 6. The old "Sign-in didn't complete" label does not appear after the successful reconnect (bundled bug fix; force one failed attempt first — back out of consent — then succeed, label must clear).
- [ ] 7. Tap the Calendar row → picker lists her owned calendars (Period Tracker + primary at least); Cancel keeps everything as-is.
- [ ] 8. Create-path test: picker → "+ Create a 'Cycle' calendar" → choice switches, sync pushes her history into the new calendar (spot-check a few events in Google Calendar). Then reopen picker → choose Period Tracker back → sync re-pairs by date: **entry count unchanged, no new events in Period Tracker** (this exercises `stripEventIds` both ways). Finally Jade deletes the "Cycle" calendar in Google Calendar's web UI (Settings → remove calendar → Delete).
- [ ] 9. Regression sweep: backdated test entry → events appear; delete it → events disappear; kill + relaunch → reconnects silently; 2 minutes on Settings → no 5s "Syncing…" loop.

- [ ] **Step 2: Record results + wrap up**

Append `> Task 7 verified YYYY-MM-DD: <notes>` here. Then:

```bash
npx vitest run   # final gate — expect 68 passed (66 from Task 4 + 2 from Task 5)
git add docs/
git commit -m "Record live verification of narrowed scopes and calendar picker"
git push -u origin gcal-scope-narrowing
gh pr create --title "Narrow Calendar OAuth scopes and add a calendar picker" --fill
```

Merge per Jade's instruction. After merge: update the `cycle-gcal-sync-handoff` memory (scopes narrowed; label fix shipped; remove both from open items) and remove the worktree if one was used.
