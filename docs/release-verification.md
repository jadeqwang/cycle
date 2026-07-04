# Release Verification Checklist

Use this checklist before uploading a Cycle release to Google Play. Keep command output and any device notes with the release candidate record.

## Command Checks

- [ ] Run the test suite:
  ```bash
  npm test
  ```
- [ ] Build the web app:
  ```bash
  npm run build
  ```
- [ ] Sync Capacitor Android assets:
  ```bash
  npx cap sync android
  ```
- [ ] Build Android debug and release bundle artifacts:
  ```bash
  cd android && ./gradlew assembleDebug bundleRelease
  ```

## Android Install Smoke Checks

- [ ] Fresh install opens without crashing.
- [ ] Log a period and confirm it appears in the app.
- [ ] Force-stop and relaunch; logged period data persists.
- [ ] Export works and produces a usable export file.
- [ ] Import works from a valid Cycle export file.
- [ ] Delete All Data clears local period data.
- [ ] Delete All Data disconnects Google Calendar sync.
- [ ] Privacy policy link opens from the app.
- [ ] Android back button behavior is sane on each main screen.
- [ ] App background/resume behavior is sane and does not lose local data.

## Google Calendar Sync Checks

Run these after the Google Calendar OAuth scope-narrowing work lands.

- [ ] OAuth consent screen shows the final Cycle app name.
- [ ] OAuth consent screen shows only the final approved scopes.
- [ ] Google Calendar connect works with the release signing SHA-1 OAuth client.
- [ ] Sync creates only Cycle-owned period events.
- [ ] Sync updates only Cycle-owned period events.
- [ ] Sync deletes only Cycle-owned period events.
- [ ] No unrelated Google Calendar events are modified or deleted.
- [ ] No future recurring projection events are imported into Cycle.

## Artifact Checks

- [ ] Release app bundle exists at `android/app/build/outputs/bundle/release/app-release.aab`.
- [ ] `versionCode` is correct for this release.
- [ ] `versionCode` has been incremented since the previous uploaded artifact.
- [ ] Release app bundle is signed with the Play upload key.
- [ ] Git diff contains no secrets, keystores, passwords, tokens, OAuth client secrets, export files, or local sync config.

## Release Gate

- [ ] All required command checks pass.
- [ ] All required Android smoke checks pass on a real device or representative emulator.
- [ ] Google Calendar checks pass after the final OAuth scope changes land.
- [ ] Artifact checks pass before upload.
- [ ] Any intentionally deferred item is documented with owner, date, and risk.
