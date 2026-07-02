# Google Calendar 2-Way Sync — Design

**Date:** 2026-07-02
**Status:** Approved direction (per-entry end dates; two phases)

## Context

Cycle is a local-only Capacitor Android app. Jade's real period history
(Aug 2023 → present) lives in a dedicated Google Calendar named
**"Period Tracker"** (calendar ID
`2b2cdbe5807596c88ccd37cb915a3f8056f85ae861e4407da01ca4fabd2508c4@group.calendar.google.com`)
as all-day events titled `period start` (40) and `period end` (39).
The Settings sheet currently has a **fake** "Google Calendar sync" toggle
and a dead "Export data" button.

Goals:
1. Get the existing history into the app without manual entry (Phase 1).
2. Real two-way sync between the app and the Period Tracker calendar (Phase 2).

Non-goals: syncing any other calendar; multi-device conflict resolution
beyond one phone + Google Calendar; iOS.

## Data model (schema v2)

`periods` changes from an array of date strings to an array of entries:

```json
{
  "start": "2026-06-28",
  "end": "2026-07-02",            // optional
  "startEventId": "abc123",       // optional; Google event id
  "endEventId": "def456",         // optional
  "updatedAt": "2026-07-02T15:00:00Z"
}
```

- Storage key stays `cycle-app.state.v1`; a `schema: 2` field is added.
  Loading v1 data (plain date strings) migrates each string to
  `{ start }`. Migration is pure and unit-tested.
- New top-level state: `deletedEventIds: string[]` (tombstones for remote
  deletion), `lastSyncedAt`, `auth` (tokens; Phase 2).
- Entries stay sorted by `start`. All date-only values use local-date
  `YYYY-MM-DD` (existing `serializeDate`/`parseStoredDate`).

### Prediction & display changes

- `periodLen` (global) remains, but **auto mode now derives from
  per-entry ends**: median of `(end − start + 1)` over the last 5 entries
  that have ends; fallback 5. Manual override retained.
- Last-period card and entry modal show the entry's real `end` when
  present, else `start + periodLen − 1` (current behavior).
- Entry modal gains an **"Ended" stepper** (chevrons, same idiom):
  bounds `start` … min(next entry start − 1, today + 7). "Not recorded"
  state allowed (end is optional).

## Phase 1 — Import / Export (no OAuth)

- **Export data** (existing stub): serializes full state (schema v2) to
  JSON. On native, opens the Android share sheet (via `@capacitor/share`);
  on web, copies to clipboard. Settings copy stays "CSV to Google Sheets"
  → changes to "JSON backup".
- **Import data** (new row in Settings): textarea in a modal; paste JSON;
  **merge semantics**: union by `start` date; incoming entry wins on
  field-level conflicts only if it has strictly more information
  (e.g. adds `end` or event ids); never deletes existing entries; invalid
  JSON → inline error, no state change.
- **Seed file**: generated in this session from the calendar via MCP
  (Claude's calendar access): all 40 entries with `start`, `end`
  (paired to the nearest following `period end` within 14 days), and
  both event ids. Delivered as a file Jade pastes into Import on the
  phone. Not committed to the repo (personal health data stays out of git).

## Phase 2 — OAuth + sync engine

### Auth

- Google OAuth 2.0 **installed-app PKCE flow** via
  `@capacitor-community/generic-oauth2` (custom-tab browser flow),
  Android OAuth client (public; no secret in the app).
- Scope: `https://www.googleapis.com/auth/calendar.events` (narrowest
  scope that allows read/write of events on a calendar the user owns).
- Tokens (access + refresh) stored via `@capacitor/preferences`.
  Sign-out wipes them.
- **User setup (Jade, one-time, ~10 min):** Google Cloud project →
  enable Calendar API → OAuth consent screen (External, Testing mode,
  add jadewang@gmail.com as test user) → create OAuth client id, type
  Android, package `com.jade.cycle`, debug-keystore SHA-1 (command
  provided). Client id lands in a git-ignored `src/sync-config.js`.

### Sync algorithm

Remote model: `period start` / `period end` all-day events on the
Period Tracker calendar. An entry's `end` event is the first `period end`
whose date is ≥ start and < next start (and within 14 days of start).

Each sync run:
1. **Pull** all events in a window (2 years back → 60 days forward,
   `updatedMin` optimization later if needed). Pair into remote entries.
2. **Diff & merge** against local:
   - Match by event id first, then by `start` date.
   - Local entry with no remote match and no event ids → **push create**
     (insert `period start`, and `period end` if entry has one; store ids).
   - Remote entry with no local match → **pull create** locally, unless
     its event id is in `deletedEventIds` → **push delete** remotely.
   - Matched but different → newer `updatedAt` (local) vs event
     `updated` (remote) wins, field-level (start date, end date).
   - Local delete (tombstone) → delete remote events, clear tombstone.
   - Remote delete (had event id, event gone) → delete local entry.
3. Persist state + `lastSyncedAt`.

Failure handling: offline / API error → sync silently skipped, retried
on next trigger; auth failure (revoked) → "Reconnect" state on the
Settings row. Sync is idempotent; a crashed run redoes work safely.

### Triggers & UI

- On app foreground/start, after any local mutation (debounced ~5 s),
  and via a **"Sync now"** action.
- Settings: the fake toggle becomes real — Off ↔ Connected(account
  email). Connected state shows calendar name ("Period Tracker"),
  last-synced time, Sync now, Sign out. The existing "Syncing…" chip
  becomes real (shows during a run; error state on failure).
- Privacy copy updated: "Your data stays on this device and in your own
  Google Calendar. No third-party servers."

### Calendar choice

V1 hard-codes lookup of a calendar named **"Period Tracker"** owned by
the user (matches existing data); if absent, sync creates it. A picker
is out of scope.

## Testing

- Unit (Vitest): v1→v2 migration; import merge rules; start/end event
  pairing; sync diff (create/update/delete each direction, tombstones,
  id-vs-date matching). Sync engine is a pure function
  `planSync(local, remote) → actions` so it's testable without HTTP.
- Runtime: browser + emulator passes as before (import/export, end-date
  stepper, migration of existing on-device data). Full OAuth round-trip
  verified on Jade's phone after she creates the client id (blocked on
  her setup; everything else lands first with the flow behind the toggle).

## Rollout order

1. Schema v2 + migration + end-date UI (usable immediately).
2. Import/Export + seed file → history on the phone.
3. OAuth flow + sync engine behind the Settings toggle.
4. Jade's Google Cloud setup → live end-to-end verification on device.
