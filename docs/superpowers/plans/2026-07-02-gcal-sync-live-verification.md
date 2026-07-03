# GCal Sync Runtime Verification + Live Setup (Task 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Google Calendar sync feature: runtime-verify the merged code (original plan Task 8 Step 4), then walk Jade through the one-time Google Cloud setup and live two-way sync verification on her phone (original plan Task 9).

**Architecture:** No new code is expected. The sync stack (`src/sync.js` planner → `src/run-sync.js` orchestration → `src/gcal.js` REST client → `src/auth.js` OAuth PKCE) is complete, reviewed twice, and merged to `main`. What's left is observing it run: first without credentials (web + emulator smoke tests), then for real (Jade's OAuth client + her phone + her calendar). Any bug found becomes a new task via systematic-debugging, not an inline patch.

**Tech Stack:** React 18 + Vite + Capacitor 7 (Android), vitest, Android SDK at `~/Android/Sdk` (platform 36, AVD `cycle-test`, adb at `~/Android/Sdk/platform-tools/adb`), JDK 21, `gh` CLI authenticated to `github.com:jadeqwang/cycle`.

## Global Constraints

- `period-import.json` (repo root) is Jade's real health data: **gitignored — never commit it, never paste its contents into chat, logs, or committed files.**
- `src/sync-config.js` is gitignored; only `src/sync-config.example.js` is committed. Never commit a file containing the real client id outside `android/gradle.properties` (Android OAuth client ids are non-secret, but keep the blast radius small).
- The sync must never pull calendar events dated after **local** today (`timeMax` = local tomorrow in `src/run-sync.js`, `pairRemoteEvents` filter in `src/sync.js`). Jade's calendar contains infinite recurring projections; this rule is load-bearing. Do not "simplify" it away, and treat any future-dated entry appearing in the app as a Critical bug.
- Baseline before this plan: 51 tests passing (`npx vitest run`), `npm run build` clean, `./gradlew assembleDebug` BUILD SUCCESSFUL, all on `main` after PR merge.
- Start from `main` (`git checkout main && git pull`), then create a working branch: `git checkout -b gcal-sync-verification`.
- **Do not run two agents/sessions that write this working tree at the same time** — a concurrent-write collision already silently reverted a change once (see round-2 fixes plan).

## Resume notes

> Progress saved 2026-07-02: Work is in isolated worktree `.worktrees/gcal-sync-verification` on branch `gcal-sync-verification`. The parent checkout on `main` has commit `534f2fb` (`Ignore local worktrees`) because `.worktrees/` had to be added to `.gitignore` before creating the project-local worktree. In the worktree, `src/sync-config.js` was created locally by copying `src/sync-config.example.js` so tests/dev server can run; it is gitignored and must not be committed. Baseline in the worktree: `npx vitest run` passed with 51 tests.
>
> Task 1 status: completed 2026-07-02 after Jade added icons under `/icons`. Added an explicit favicon link in `index.html`, copied the new icon assets into this worktree, and added a small regression test for the favicon declaration. `npx vitest run` now passes with 52 tests. Browser automation reran against Vite at `http://localhost:5174/` (5173 was already occupied): Settings opened; web Google Calendar row showed subtitle "Available in the Android app"; Connect button was visible but disabled; scratch/default Export produced schema 2 JSON with a `periods` array; synthetic Import made an entry visible in history; browser console and network had no errors; screenshot captured at `/tmp/cycle-task1/settings-sheet.png`. The Vite dev server started for Task 1 was stopped.
>
> Current uncommitted work in `.worktrees/gcal-sync-verification`: this plan file, `index.html`, new `icons/`, and new `src/index-html.test.js`. Do not commit yet unless following the plan's Task 2 Step 4 commit point; Task 2 is next. Next session should start in `.worktrees/gcal-sync-verification`, confirm `src/sync-config.js` still exists locally (gitignored placeholder copy), then run Task 2 emulator smoke test exactly as written. After both Task 1 and Task 2 pass, check off Task 8 Step 4 in `docs/superpowers/plans/2026-07-02-google-calendar-sync.md` and commit the docs/icon/favicon/test changes per the plan.

## Known deferred items (do NOT implement; listed so they aren't "discovered" as bugs)

- An entry **deleted** while a sync is in flight is resurrected by the sync result (tombstones are cleared unconditionally by `planSync`). Accepted, deferred.
- Render-phase ref writes in `CycleApp.jsx` (`periodsRef.current = periods` in the component body). Accepted idiom, deferred.
- Web builds intentionally show the sync row disabled ("Available in the Android app") — not a bug.

---

### Task 1: Web runtime smoke test (Task 8 Step 4, browser half)

**Files:**
- None modified. Read-only verification of the built app.

**Interfaces:**
- Consumes: the dev server (`npm run dev`, serves on 0.0.0.0).
- Produces: a pass/fail note per checklist item, appended to this plan file under this task.

- [x] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite prints a local URL (default `http://localhost:5173/`).

- [x] **Step 2: Verify in a browser** (use browser automation or Jade's Chrome; capture a screenshot of the settings sheet):

1. Open the app → tap the gear → Settings sheet opens.
2. The Google Calendar sync row is present but **disabled**, subtitle "Available in the Android app". No Connect button works on web.
3. Export data → JSON is copied/downloaded (schema 2, `periods` array present). Do this with scratch data, not the real import.
4. Import: paste a small synthetic backup, e.g. `{"schema":2,"periods":[{"start":"2026-06-01","end":"2026-06-05","startEventId":null,"endEventId":null,"updatedAt":"2026-06-01T00:00:00Z"}]}` → entry appears in history.
5. Browser console: no errors (warnings from Capacitor plugins on web are OK; anything red is not).

- [x] **Step 3: Record results**

Append `> Task 1 verified YYYY-MM-DD: <notes>` under this task in this plan file. Any failure → stop, use superpowers:systematic-debugging, file the fix as a new task.

> Task 1 attempted 2026-07-02: Dev server started successfully at `http://localhost:5173/`. Browser automation with system Chrome verified Settings opens; Google Calendar sync row is present on web with subtitle "Available in the Android app"; Export produced schema 2 JSON with a `periods` array using scratch/default web data; Import of a small synthetic backup made an entry visible in history; screenshot captured at `/tmp/cycle-task1/settings-sheet.png`. Blocked/failing checklist item: browser console had one red error for Chrome's automatic `http://localhost:5173/favicon.ico` request returning 404. No application/page exceptions observed. Follow-up task: add/provide a favicon or otherwise eliminate the favicon 404 so the console check is fully clean, then rerun Task 1.
>
> Task 1 verified 2026-07-02: Added the new `/icons` assets and an explicit `<link rel="icon" href="/icons/favicon.ico" />`; regression test `src/index-html.test.js` confirms the declaration. `npx vitest run` passed with 52 tests. Reran browser automation with system Chrome against Vite at `http://localhost:5174/` (5173 was occupied): Settings sheet opens; Google Calendar sync row is present on web with subtitle "Available in the Android app"; Connect is disabled on web; Export produced schema 2 JSON with a `periods` array using scratch/default data; Import of the synthetic backup made an entry visible in history; browser console and network had no errors; screenshot captured at `/tmp/cycle-task1/settings-sheet.png`.

### Task 2: Emulator runtime smoke test (Task 8 Step 4, emulator half)

**Files:**
- None modified. Uses the debug APK built from `main`.

**Interfaces:**
- Consumes: AVD `cycle-test`; APK at `android/app/build/outputs/apk/debug/app-debug.apk`.
- Produces: pass/fail notes appended under this task.

- [x] **Step 1: Build and install on the emulator**

```bash
npm run cap:sync
cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug --no-daemon && cd ..
~/Android/Sdk/emulator/emulator -avd cycle-test -no-snapshot-save &
~/Android/Sdk/platform-tools/adb wait-for-device
~/Android/Sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
~/Android/Sdk/platform-tools/adb shell monkey -p com.jade.cycle 1
```

Expected: app launches to the dashboard.

- [x] **Step 2: Verify pre-credential behavior** (screenshots: `~/Android/Sdk/platform-tools/adb exec-out screencap -p > /tmp/claude/shot-N.png`):

1. Settings → the sync row shows a **Connect** button (not the disabled web row).
2. Tap Connect with the placeholder client id (`REPLACE_ME…`) → system browser opens to a Google error page ("invalid client" or similar). **This is the expected pre-setup behavior.**
3. Back out to the app → no crash, Settings still responsive, subtitle shows the disconnected state (inline "Sign-in didn't complete" note is acceptable).
4. Log a period, kill the app (`adb shell am force-stop com.jade.cycle`), relaunch → the entry persisted.

- [x] **Step 3: Record results**

Append `> Task 2 verified YYYY-MM-DD: <notes>` under this task. Check off Task 8 Step 4 in `docs/superpowers/plans/2026-07-02-google-calendar-sync.md` (line ~1314) once both Task 1 and Task 2 pass.

> Task 2 verified 2026-07-03: `npm run cap:sync` completed cleanly. Initial Gradle build failed because the shell already exported `ANDROID_HOME`/`ANDROID_SDK_ROOT=/usr/lib/android-sdk` while the plan command overrode only `ANDROID_HOME` to `~/Android/Sdk`; reran with both variables set to `~/Android/Sdk`, then escalated for normal `~/.gradle` cache access, and `assembleDebug` completed with BUILD SUCCESSFUL. Launched headless AVD `cycle-test`, installed `android/app/build/outputs/apk/debug/app-debug.apk`, and launched `com.jade.cycle`. Screenshots captured under `/tmp/claude/`: dashboard, native Settings, OAuth placeholder error, returned Settings, and post-relaunch persistence. Settings showed a native Google Calendar sync row with enabled Connect button and subtitle "Two-way sync with your Period Tracker calendar". Tapping Connect with placeholder `REPLACE_ME.apps.googleusercontent.com` opened Chrome to `accounts.google.com` with Google `400. That's an error.` / malformed request, after dismissing Chrome first-run setup. Closing the custom tab returned to Settings without crash; row remained disconnected with Connect available. Logged July 3, force-stopped the app, relaunched, and the dashboard/history still showed the July 3 entry plus the prior July 2 entry.

- [x] **Step 4: Commit the checkbox/notes update**

```bash
git add docs/superpowers/plans/
git commit -m "Record runtime verification of sync UI without credentials"
```

### Task 3: Write `docs/google-cloud-setup.md` (Task 9 Step 1)

**Files:**
- Create: `docs/google-cloud-setup.md`

**Interfaces:**
- Produces: the checklist Jade follows in Task 4. Content below is final — copy verbatim (it was already reviewed as part of the original plan).

- [x] **Step 1: Create the file with exactly this content:**

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

- [x] **Step 2: Sanity-check the two config touchpoints still exist**

Run: `grep -n "clientId" src/sync-config.example.js && grep -n "OAUTH_SCHEME" android/app/build.gradle`
Expected: both match (template `clientId` field; `manifestPlaceholders = [oauthScheme: project.findProperty('OAUTH_SCHEME') ?: 'com.jade.cycle.unset']`).

> Task 3 Steps 1-2 verified 2026-07-03: Created `docs/google-cloud-setup.md` with the reviewed setup checklist. Sanity checks matched `src/sync-config.example.js:4` (`clientId`) and `android/app/build.gradle:13` (`OAUTH_SCHEME` manifest placeholder).

- [ ] **Step 3: Commit**

```bash
git add docs/google-cloud-setup.md
git commit -m "Add Google Cloud OAuth setup guide"
```

### Task 4: Jade's one-time Google Cloud setup — **[Jade, manual; agent assists]**

**Files:**
- Modify (local only, uncommitted): `src/sync-config.js` (create from `src/sync-config.example.js` if absent)
- Modify: `android/gradle.properties` (the `OAUTH_SCHEME` line — committing this is OK)

**Interfaces:**
- Consumes: `docs/google-cloud-setup.md` steps 1–7.
- Produces: a real `clientId` in `src/sync-config.js`, `OAUTH_SCHEME` in `android/gradle.properties`, and an installed APK on Jade's phone. Task 5 cannot start without these.

- [ ] **Step 1:** Jade follows `docs/google-cloud-setup.md` steps 1–7. Agent can run step 1 (keytool) and step 7 (build + `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` with her phone on USB) for her; steps 2–6 are in her browser (suggest `! keytool …` in the session if she wants the SHA-1 inline).
- [ ] **Step 2: Verify the wiring before touching the phone:** `grep OAUTH_SCHEME android/gradle.properties` shows `com.googleusercontent.apps.<digits>-<hash>`, and `grep clientId src/sync-config.js` shows the same id with the `.apps.googleusercontent.com` suffix. `npx vitest run` still 51/51 (config isn't imported by tests, but cheap insurance).
- [ ] **Step 3: Commit** (only `android/gradle.properties` — `sync-config.js` stays untracked):

```bash
git add android/gradle.properties
git commit -m "Point OAuth deep link at the real client id"
```

### Task 5: Live two-way sync verification — **[Jade + agent, her phone + her calendar]** (Task 9 Step 2)

**Files:**
- None. Observational; results recorded in this plan file.

**Interfaces:**
- Consumes: installed configured APK (Task 4); `period-import.json` contents pasted by **Jade herself** (never by the agent into any committed/logged artifact).
- Produces: checked-off verification list below; any failure becomes a bug task.

Run through in order; capture adb screenshots where possible. **The safety property under test in items 1–2:** connecting must NOT create, move, or delete anything in her existing calendar, and must NOT import any future-dated projection.

- [ ] 1. Import seed → history shows 40 entries, newest 2026-06-28. **No entry dated after local today.**
- [ ] 2. Connect → Google consent screen → back in app, subtitle "Synced · today". Her calendar gains NO new events, and an exported backup now shows event ids on entries matching real calendar event ids (spot-check 2).
- [ ] 3. Log a period backdated 2 days → within ~5 s + one manual "Sync now", a standalone "period start" all-day event appears in Google Calendar on that date.
- [ ] 4. Set that entry's end date in the app → "period end" event appears in the calendar.
- [ ] 5. Move a past "period start" event by one day in Google Calendar → "Sync now" in app → the entry's date updates to match.
- [ ] 6. Delete the test entry in the app → both its events disappear from the calendar after sync.
- [ ] 7. Kill + relaunch the app → data intact, sync reconnects silently (subtitle returns to "Synced · …" without re-consent).
- [ ] 8. **Loop check (regression for round-2 fix):** leave the app open on Settings for 2 minutes after a sync → the "Syncing…" chip does NOT keep reappearing every ~5 s.

- [ ] **Step 2: Jade ends the two recurring series** (setup doc step 10) so projections stop accumulating. Then one final "Sync now" → entry count unchanged (ended past instances remain; the app never pulled the future ones).

### Task 6: Wrap up

- [ ] **Step 1:** Check off Task 9 in `docs/superpowers/plans/2026-07-02-google-calendar-sync.md`; append verification notes to this plan.
- [ ] **Step 2:** `npx vitest run` (expect 51 passed) as a final regression gate.
- [ ] **Step 3: Commit + merge**

```bash
git add docs/
git commit -m "Record live sync verification results"
git push -u origin gcal-sync-verification
gh pr create --title "Verify Google Calendar sync live and document setup" --fill
```

Merge per Jade's instruction, then update the `cycle-gcal-sync-handoff` memory: feature shipped; drop the "blocked on Jade" items.
