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
