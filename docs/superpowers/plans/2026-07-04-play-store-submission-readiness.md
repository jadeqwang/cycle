# Play Store Submission Readiness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Cycle for Google Play submission, excluding the Google Calendar OAuth scope-narrowing work currently owned by another Codex instance.

**Architecture:** Split the work into independent agent tasks for Android release packaging, privacy/data controls, policy docs, store assets, and verification. Keep owner-only Play Console, legal/account, and tester coordination work separate so agents do not pretend to complete actions that require Jade's accounts, judgment, or credentials.

**Tech Stack:** React + Vite, Capacitor 7, Android Gradle project, Google Play Console, Google Cloud OAuth consent screen, Google Calendar API.

---

## Current State

- Another Codex instance is working on item 1: narrowing Google Calendar OAuth scopes. Do not duplicate or overwrite that work.
- `main` currently has `targetSdkVersion = 36` in `android/variables.gradle`, which satisfies the current Play target API requirement for new apps.
- `main` currently has only a debug APK under `android/app/build/outputs/apk/debug/app-debug.apk`.
- `android/app/build.gradle` has `versionCode 1`, `versionName "1.0"`, and no release signing config.
- `android/app/src/main/AndroidManifest.xml` has `android:allowBackup="true"`.
- `site/privacy.html` exists but still contains production-review caveats.
- `docs/privacy-policy-outline.md` already identifies important release blockers: disable Android backup, add Delete All Data, confirm final OAuth scopes, confirm crash reporting, and keep Data Safety consistent.

## Coordination Rules

- Do not commit secrets, keystores, passwords, `src/sync-config.js`, `period-import.json`, or Play Console credentials.
- Do not modify `.worktrees/gcal-scope-narrowing` unless the scope-narrowing owner explicitly hands off that work.
- Before changing files, run `git status --short` and preserve unrelated user or agent changes.
- Use Android App Bundle (`.aab`) for Play submission, not a debug APK.
- Treat menstrual cycle data as personal and sensitive health data in docs, UI copy, and Play declarations.
- Keep privacy policy, in-app disclosures, Google OAuth consent screen, Data Safety, and actual app behavior consistent.

## Agent Task 2: Release Signing And App Bundle

**Owner:** Agent

**Files:**
- Modify: `android/app/build.gradle`
- Modify or create: `android/gradle.properties` only for non-secret property names
- Do not commit: keystore files, keystore passwords, Play upload key passwords
- Verify: `android/app/build/outputs/bundle/release/app-release.aab`

- [ ] Step 1: Inspect current Android release config.

  Run:
  ```bash
  git status --short
  sed -n '1,220p' android/app/build.gradle
  sed -n '1,220p' android/gradle.properties
  ```

  Expected: release build exists but has no signing config.

- [ ] Step 2: Add release signing config that reads from Gradle properties or environment variables.

  Recommended shape in `android/app/build.gradle`:
  ```gradle
  def releaseStoreFile = project.findProperty('CYCLE_RELEASE_STORE_FILE') ?: System.getenv('CYCLE_RELEASE_STORE_FILE')
  def releaseStorePassword = project.findProperty('CYCLE_RELEASE_STORE_PASSWORD') ?: System.getenv('CYCLE_RELEASE_STORE_PASSWORD')
  def releaseKeyAlias = project.findProperty('CYCLE_RELEASE_KEY_ALIAS') ?: System.getenv('CYCLE_RELEASE_KEY_ALIAS')
  def releaseKeyPassword = project.findProperty('CYCLE_RELEASE_KEY_PASSWORD') ?: System.getenv('CYCLE_RELEASE_KEY_PASSWORD')
  def hasReleaseSigning = releaseStoreFile && releaseStorePassword && releaseKeyAlias && releaseKeyPassword
  ```

  Add inside `android { ... }`:
  ```gradle
  signingConfigs {
      release {
          if (hasReleaseSigning) {
              storeFile file(releaseStoreFile)
              storePassword releaseStorePassword
              keyAlias releaseKeyAlias
              keyPassword releaseKeyPassword
          }
      }
  }
  ```

  Add inside `buildTypes.release`:
  ```gradle
  signingConfig hasReleaseSigning ? signingConfigs.release : null
  ```

- [ ] Step 3: Add a commented local template for release signing values.

  Add comments to `android/gradle.properties`, with no real secrets:
  ```properties
  # Release signing values are intentionally local-only.
  # CYCLE_RELEASE_STORE_FILE=/absolute/path/to/upload-keystore.jks
  # CYCLE_RELEASE_STORE_PASSWORD=...
  # CYCLE_RELEASE_KEY_ALIAS=...
  # CYCLE_RELEASE_KEY_PASSWORD=...
  ```

- [ ] Step 4: Ensure keystores cannot be committed.

  Check and update `.gitignore` or `android/.gitignore` so these patterns are ignored:
  ```gitignore
  *.jks
  *.keystore
  ```

- [ ] Step 5: Build a release app bundle.

  Run:
  ```bash
  npm run build
  npx cap sync android
  cd android && ./gradlew bundleRelease
  ```

  Expected: `android/app/build/outputs/bundle/release/app-release.aab` exists. If signing properties are absent, the agent should report that Jade must provide or generate the upload key before a signed release bundle can be produced.

- [ ] Step 6: Commit only source/config changes.

  Run:
  ```bash
  git diff -- android/app/build.gradle android/gradle.properties .gitignore android/.gitignore
  git status --short
  ```

  Commit message:
  ```bash
  git add android/app/build.gradle android/gradle.properties .gitignore android/.gitignore
  git commit -m "Prepare Android release signing configuration"
  ```

## Agent Task 3: Disable Android Backup For Sensitive Local Data

**Owner:** Agent

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Test: Android release/debug manifest merge output

- [ ] Step 1: Change backup behavior.

  In `android/app/src/main/AndroidManifest.xml`, change:
  ```xml
  android:allowBackup="true"
  ```

  To:
  ```xml
  android:allowBackup="false"
  ```

- [ ] Step 2: Build and verify merged manifest.

  Run:
  ```bash
  cd android && ./gradlew assembleDebug
  grep -n 'allowBackup' app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml
  ```

  Expected: merged manifest shows `android:allowBackup="false"`.

- [ ] Step 3: Commit.

  ```bash
  git add android/app/src/main/AndroidManifest.xml
  git commit -m "Disable Android backup for sensitive local data"
  ```

## Agent Task 4: Delete All Data Flow

**Owner:** Agent

**Files:**
- Modify: `src/CycleApp.jsx`
- Modify or create tests: `src/CycleApp.test.js`
- Inspect: `src/auth.js`, `src/sync-config.js`, `src/run-sync.js`

- [ ] Step 1: Confirm current persistence keys and sign-out behavior.

  Run:
  ```bash
  grep -RIn "localStorage\\|Preferences\\|signOut\\|deletedEventIds\\|lastSyncedAt" src
  ```

  Expected: identify every local app-data location that must be cleared.

- [ ] Step 2: Add tests for a pure reset helper.

  Add or extend tests so they cover a helper that returns the default app state after local deletion:
  ```js
  expect(resetCycleDataState()).toEqual({
    periods: [],
    deletedEventIds: [],
    lastSyncedAt: null,
    cycleLen: 27,
    cycleMode: 'manual',
    periodLen: 5,
    periodMode: 'manual',
    calSync: false,
  });
  ```

  Adjust expected values only if the existing app defaults differ.

- [ ] Step 3: Implement a Settings action named `Delete all data`.

  Required behavior:
  - Require an explicit confirmation before deleting.
  - Clear local period records.
  - Clear deleted-event tombstones.
  - Clear sync metadata.
  - Clear Google auth tokens by calling existing sign-out/token cleanup.
  - Turn Google Calendar sync off.
  - Preserve purely visual preferences unless Jade explicitly chooses otherwise.

- [ ] Step 4: If Google Calendar sync is connected, do not silently delete remote events.

  Release-safe first version:
  - Delete local data and disconnect sync.
  - Explain in the confirmation copy that existing Google Calendar events remain in the user's calendar and can be deleted from Google Calendar.

  Future optional version:
  - Offer a separate, explicit choice to also delete synced Cycle events from Google Calendar.

- [ ] Step 5: Run tests.

  ```bash
  npm test
  npm run build
  ```

- [ ] Step 6: Commit.

  ```bash
  git add src/CycleApp.jsx src/CycleApp.test.js
  git commit -m "Add local data deletion flow"
  ```

## Agent Task 5: Finalize Privacy Policy And In-App Privacy Access

**Owner:** Agent drafts, Jade reviews

**Files:**
- Modify: `landingpage/privacy.html`
- Modify: `site/privacy.html` after running `npm run build:site`, or document that `site/` is generated
- Modify: `docs/privacy-policy-outline.md`
- Modify: `src/CycleApp.jsx` if no in-app privacy link exists

- [ ] Step 1: Remove draft caveats from the public privacy policy.

  Delete production-only caveat text like:
  ```text
  This page is a practical privacy summary for the current app. It should be reviewed before production publication...
  ```

- [ ] Step 2: Add required policy content in plain language.

  The policy must cover:
  - Developer/app identity: Cycle.
  - Privacy contact: `contact@cycleapp.org`.
  - Data stored locally: period dates, prediction settings, appearance settings, sync metadata, import/export data, Google auth tokens if sync is enabled.
  - Optional Google Calendar sync: what is read/written, why, and that the data is stored in the user's Google account.
  - No developer-operated backend for cycle history.
  - No ads, no analytics SDK, no sale of personal/sensitive data.
  - Export/import behavior and user-directed sharing.
  - Deletion and retention behavior matching Agent Task 4.
  - Security: local device security and HTTPS/OAuth for Google APIs; avoid unimplemented claims like end-to-end encryption.
  - Third parties: Google Play and Google Calendar when used.

- [ ] Step 3: Add a reachable privacy policy link inside the app if missing.

  Preferred location: Settings sheet. Link should open the hosted privacy policy URL through Capacitor Browser or a normal anchor on web.

- [ ] Step 4: Build site assets.

  ```bash
  npm run build:site
  ```

- [ ] Step 5: Test.

  ```bash
  npm test
  npm run build
  ```

- [ ] Step 6: Commit.

  ```bash
  git add landingpage/privacy.html site/privacy.html docs/privacy-policy-outline.md src/CycleApp.jsx
  git commit -m "Finalize privacy policy for Play submission"
  ```

## Agent Task 6: Play Console Declaration Draft Pack

**Owner:** Agent drafts, Jade submits

**Files:**
- Create: `docs/play-console-declarations.md`

- [ ] Step 1: Create a declaration draft document with copy Jade can paste into Play Console.

  Include these sections:
  - Data Safety draft answers.
  - App access draft answers.
  - Ads declaration.
  - Content rating notes.
  - Target audience notes.
  - Health/sensitive data notes.
  - Account deletion note: no Cycle account exists.
  - Privacy policy URL placeholder.
  - OAuth consent screen consistency checklist.

- [ ] Step 2: Data Safety draft should reflect app behavior.

  Baseline draft, to be verified after implementation:
  - No advertising ID collection.
  - No ads.
  - No analytics SDK.
  - No developer server collection of cycle history.
  - Health data is stored on device.
  - If Google Calendar sync is enabled, user-directed period event data is transmitted to Google Calendar to provide sync.
  - Data is encrypted in transit when sent to Google APIs.
  - User can request/delete data locally using the in-app deletion flow.

- [ ] Step 3: Link official references in the doc.

  Include:
  - Google Play Data Safety: `https://support.google.com/googleplay/android-developer/answer/10787469`
  - Google Play User Data policy: `https://support.google.com/googleplay/android-developer/answer/10144311`
  - Target API requirement: `https://developer.android.com/google/play/requirements/target-sdk`
  - App testing requirement: `https://support.google.com/googleplay/android-developer/answer/14151465`
  - OAuth verification: `https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification`

- [ ] Step 4: Commit.

  ```bash
  git add docs/play-console-declarations.md
  git commit -m "Draft Play Console declarations"
  ```

## Agent Task 7: Store Listing Assets And Copy Pack

**Owner:** Agent drafts/captures, Jade approves

**Files:**
- Create: `docs/play-store-listing.md`
- Create or update: `store-assets/`

- [ ] Step 1: Create listing copy.

  `docs/play-store-listing.md` should include:
  - App name: `Cycle`.
  - Short description, max 80 characters.
  - Full description, max 4000 characters.
  - Category recommendation.
  - Tags recommendation.
  - Support email: `contact@cycleapp.org`.
  - Website URL and privacy policy URL placeholders.

- [ ] Step 2: Capture final Android screenshots.

  Required minimum:
  - Phone screenshots of the main tracker screen.
  - Settings screen with privacy/export/import/sync controls.
  - Calendar sync state if enabled for the release.
  - Delete All Data confirmation after Agent Task 4 lands.

  Use final release-like build, not stale landing page screenshots.

- [ ] Step 3: Prepare graphic assets.

  Check current icons under `android/app/src/main/res/mipmap-*` and landing assets under `landingpage/icons`. Create `store-assets/README.md` that records:
  - Which app icon is used.
  - Which screenshots are final.
  - Whether a feature graphic was created.
  - Capture device and date.

- [ ] Step 4: Commit docs and assets.

  ```bash
  git add docs/play-store-listing.md store-assets
  git commit -m "Prepare Play Store listing assets"
  ```

## Agent Task 8: Release Verification Checklist

**Owner:** Agent performs local checks, Jade performs phone/account checks

**Files:**
- Create: `docs/release-verification.md`

- [ ] Step 1: Create verification checklist.

  Include these command checks:
  ```bash
  npm test
  npm run build
  npx cap sync android
  cd android && ./gradlew assembleDebug bundleRelease
  ```

- [ ] Step 2: Include Android install smoke checks.

  Required checks:
  - Fresh install opens without crash.
  - Log a period.
  - Force-stop and relaunch; data persists.
  - Export works.
  - Import works.
  - Delete All Data clears local data and disconnects sync.
  - Privacy policy link opens.
  - Back button and app resume behavior are sane.

- [ ] Step 3: Include Google Calendar sync checks after scope-narrowing branch lands.

  Required checks:
  - OAuth consent screen shows final app name.
  - OAuth consent screen shows only the final approved scopes.
  - Connect works with the production signing SHA-1 client.
  - Sync creates/updates/deletes only Cycle period events.
  - No future recurring projection events are imported into Cycle.

- [ ] Step 4: Include artifact checks.

  Required checks:
  - `.aab` exists.
  - Version code is correct and incremented for every upload.
  - Release artifact is signed with upload key.
  - No secrets are present in git diff.

- [ ] Step 5: Commit.

  ```bash
  git add docs/release-verification.md
  git commit -m "Document release verification checklist"
  ```

## Agent Task 9: Closed Testing Preparation

**Owner:** Agent drafts, Jade recruits/submits

**Files:**
- Create: `docs/closed-testing-plan.md`

- [ ] Step 1: Create a closed testing plan.

  Include:
  - Tester invitation instructions.
  - Minimum requirement note: new personal developer accounts may need at least 12 opted-in testers for 14 continuous days before production access.
  - Tester feedback questions.
  - Bug report template.
  - Testing scenarios: onboarding, logging, editing, export/import, delete all data, optional Google Calendar sync, offline behavior, app restart.
  - Tracking table with columns: tester, device, Android version, opted-in date, feedback received, blocking issues.

- [ ] Step 2: Commit.

  ```bash
  git add docs/closed-testing-plan.md
  git commit -m "Plan Play closed testing"
  ```

## Jade Todo Items

These require Jade's accounts, credentials, legal judgment, or external coordination.

- [ ] Decide whether Play distribution is for public production or a small known-user/personal release.
- [ ] Confirm whether the Google Play developer account is a personal account created after November 13, 2023. If yes, plan for the 12 tester / 14 continuous day closed test.
- [ ] Create or confirm the Play Console app using package name `com.jade.cycle`. This package name is permanent once uploaded.
- [ ] Accept Play App Signing terms in Play Console.
- [ ] Generate or provide a Play upload key for release signing. Keep the keystore and passwords out of git and chat.
- [ ] Add the release upload certificate SHA-1 to the Google Cloud Android OAuth client, or create a production Android OAuth client for `com.jade.cycle`.
- [ ] Confirm the OAuth consent screen uses the production app name, support email, home page URL, and privacy policy URL.
- [ ] Submit OAuth verification if Google requires it for the final Calendar scopes. Prepare an unlisted demo video if requested.
- [ ] Review and approve the final privacy policy. Consider legal review because menstrual cycle data is sensitive health data.
- [ ] Publish the privacy policy and landing page to a stable public URL.
- [ ] Complete Play Console Data Safety using `docs/play-console-declarations.md` as a draft, after verifying it matches the final app.
- [ ] Complete Play Console app content declarations: app access, ads, content rating, target audience, news apps if asked, data safety, health/sensitive data where applicable.
- [ ] Provide store listing text approval: app name, short description, full description, category, tags, contact email, website.
- [ ] Approve final screenshots and feature graphic before upload.
- [ ] Recruit closed testers if required.
- [ ] Upload the signed `.aab` to internal testing first.
- [ ] Install from Play internal testing and do a final real-device smoke test.
- [ ] Promote to closed testing or production only after release verification is complete.

## Final Gate Before Submission

- [ ] Scope-narrowing work has landed or Jade explicitly accepts the current OAuth verification burden.
- [ ] `android:allowBackup="false"` is verified in the merged manifest.
- [ ] Delete All Data exists and has been tested.
- [ ] Privacy policy is public, final, and linked from the app and Play Console.
- [ ] Data Safety and privacy policy match actual behavior.
- [ ] Release `.aab` is signed and uploaded to internal testing.
- [ ] Real-device install from Play internal testing passes.
- [ ] Google Calendar sync works using the release signing SHA-1 configuration.
- [ ] Store listing assets and declarations are complete.
- [ ] Closed testing requirement is satisfied if applicable.
