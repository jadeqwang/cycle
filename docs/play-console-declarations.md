# Play Console Declaration Draft Pack

This is draft copy for Jade to use when completing Google Play Console declarations for Cycle. Verify every answer against the final shipped app, final privacy policy, and final Google OAuth consent screen before submitting.

Official references:

- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Target API requirement: https://developer.android.com/google/play/requirements/target-sdk
- App testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- OAuth verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

## Data Safety Draft Answers

Use these answers as a baseline only. Update them if Cycle adds analytics, crash reporting SDKs, backend services, ads, notifications, or any new third-party SDK.

### Collection and Sharing Summary

- Does the app collect or share user data? Draft answer: Yes, only to the extent that optional, user-directed Google Calendar sync transmits period event data to Google APIs when the user enables sync.
- Is all user data collected by the app encrypted in transit? Draft answer: Yes. Google Calendar sync uses HTTPS / Google APIs.
- Does the app provide a way for users to request that data be deleted? Draft answer: Yes, when the in-app local deletion flow is implemented. Until then, mark this as pending and do not submit an answer that overstates the app.

### Data Types

Health and fitness:

- Data type: Health info.
- Collected: Yes, if Google Calendar sync is enabled; otherwise health data is stored on the user's device and not sent to developer-operated servers.
- Shared: No sale or advertising sharing. Data is transmitted to Google Calendar only at the user's direction to provide sync.
- Purpose: App functionality.
- Required or optional: Optional. Cycle can be used without Google Calendar sync.
- Processing notes: Period dates and related cycle records are sensitive health data. Keep this consistent with the public privacy policy and in-app disclosures.

Personal info:

- Google account identity may be used for optional Google Calendar sync through Google OAuth.
- Purpose: App functionality, account connection to Google Calendar.
- Required or optional: Optional.
- Do not claim collection for developer marketing, analytics, advertising, or profiling.

App activity:

- Draft answer: No in-app analytics SDK and no developer-operated analytics collection.
- Google Play Console may show aggregate platform metrics such as installs, crashes, ANRs, and ratings. Treat these as Google Play platform metrics, not Cycle in-app analytics.

Device or other IDs:

- Advertising ID: No.
- Other device IDs: No, unless a future SDK adds this. Re-check before submission.

Files and docs:

- Cycle may allow user-directed export and import of local data. Exported files remain under the user's control.
- Do not list this as developer collection unless the app sends exported files to developer-operated systems, which it currently does not.

### Security Practices

- Encryption in transit: Yes for data sent to Google APIs during optional Google Calendar sync.
- Data deletion: Users should be able to delete local Cycle data using the in-app deletion flow when implemented. If local deletion is still pending, state that it is pending internally and complete implementation before final Play submission.
- No developer server collection: Cycle does not operate a developer backend that collects cycle history.
- Local storage: Health data is stored on the user's device unless the user enables Google Calendar sync.

### Explicit Negative Statements

- No ads.
- No advertising SDK.
- No advertising ID collection.
- No analytics SDK.
- No sale of personal or sensitive user data.
- No developer-operated server collection of cycle history.
- No developer-operated backend used for Google Calendar sync.

## App Access Draft Answers

- App access restriction: Draft answer: All core app features are available without a Cycle account.
- Login requirement: Draft answer: No Cycle account exists.
- Google sign-in / Google OAuth: Optional and used only for Google Calendar sync.
- Reviewer access notes: Reviewers can use Cycle without signing in. To test Google Calendar sync, use a Google account and enable sync from the app's settings or sync controls. Do not provide personal credentials in Play Console notes.

## Ads Declaration

- Contains ads: No.
- Uses advertising ID: No.
- Notes: Cycle does not include ads, an advertising SDK, or advertising-based monetization.

## Content Rating Notes

Suggested questionnaire framing:

- App category: Health / menstrual cycle tracking.
- User-generated content: No public user-generated content or social features.
- Violence, hate, illegal activities, gambling, financial products: No.
- Medical claims: Avoid claiming diagnosis, treatment, contraception, fertility guarantees, or emergency medical use.
- Sensitive topic note: The app handles menstrual cycle information entered by the user.

Suggested reviewer note:

Cycle is a menstrual cycle tracking app for recording period dates and viewing estimated cycle timing. It is not a medical diagnosis tool and does not provide emergency, contraceptive, or treatment advice.

## Target Audience Notes

- Intended audience: General users who menstruate.
- Children: Cycle is not directed to children under 13.
- Family policy: Do not enroll in Designed for Families unless the app is intentionally redesigned and reviewed for that program.
- Store listing and screenshots should avoid child-directed language, characters, or marketing.

## Health and Sensitive Data Notes

- Treat period dates, cycle history, predictions, and synced period calendar events as personal and sensitive health data.
- State plainly that Cycle stores health data locally on the user's device.
- State plainly that optional Google Calendar sync sends user-directed period event data to Google Calendar to provide sync.
- Do not imply that Cycle uses health data for ads, analytics, profiling, resale, or marketing.
- Do not claim HIPAA compliance, medical-device status, diagnosis, treatment, or end-to-end encryption unless separately implemented and legally reviewed.
- Keep Android backup, local deletion, privacy policy, OAuth consent, and Play Data Safety answers aligned before submission.

## Account Deletion Note

Draft answer:

Cycle does not create or manage Cycle accounts, so there is no Cycle account to delete. Users can use the app without creating an account. If a user enables optional Google Calendar sync, they can disconnect sync in the app, revoke Cycle's Google access from their Google Account settings, and delete local Cycle data using the in-app deletion flow when implemented.

## Privacy Policy URL Placeholder

Play Console privacy policy URL:

`TODO: https://cycleapp.org/privacy`

Before submission:

- Confirm the URL is public without login.
- Confirm the page names Cycle and includes contact information.
- Confirm it matches the final Data Safety form.
- Confirm it describes optional Google Calendar sync, no ads, no analytics SDK, no developer backend collection of cycle history, local storage, and local deletion behavior.

## OAuth Consent Screen Consistency Checklist

Use this checklist before submitting the Google OAuth consent screen for production or verification:

- App name is Cycle everywhere: app UI, Play listing, privacy policy, OAuth consent screen, and Google Cloud project.
- Support email and developer contact are current.
- Privacy policy URL exactly matches the public Play Console privacy policy URL.
- Authorized domains include the domain hosting the privacy policy.
- Requested scopes are the final narrowed Google Calendar scopes and match actual app behavior.
- Scope justifications say Google Calendar access is used only to create, read, update, or delete user-directed Cycle period events for optional sync.
- OAuth copy does not claim ads, analytics, marketing, profiling, resale, or developer-server processing of cycle history.
- Demo video or reviewer notes, if required, show only the optional Google Calendar sync flow and why each requested scope is needed.
- Data Safety answers, User Data policy disclosures, OAuth consent copy, and privacy policy all describe the same data handling model.
