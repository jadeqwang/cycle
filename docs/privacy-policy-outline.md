# Cycle Privacy Policy Outline

This document is a drafting outline for Cycle's public privacy policy and Google Play Data Safety answers. It is not legal advice.

## Policy Position

Cycle is designed so the app developer does not collect users' menstrual or cycle data.

Cycle does not operate a backend server. Cycle does not sell, rent, monetize, profile, or use cycle data for advertising or marketing. User-entered data is stored locally on the user's device and, if the user enables Google Calendar sync, in the user's own Google Calendar account.

## Audience

Cycle is intended for general users who menstruate.

Cycle is not directed to children under 13.

## Data Stored on the Device

Cycle stores app data locally on the user's device. This may include:

- Period start and end dates.
- App preferences and settings.
- Deleted period records needed to keep Google Calendar sync accurate.
- Import and export state.
- Google sign-in tokens used to keep optional calendar sync connected.

Android cloud backup has been disabled for Cycle app data for release readiness.

## Google Calendar Sync

Google Calendar sync is optional.

If the user enables sync, Cycle uses Google OAuth to connect to the user's Google account. Cycle may create, read, update, and delete period-related calendar events in the user's selected or configured Google Calendar.

If a user deletes a period locally in Cycle, sync should delete the corresponding Google Calendar event.

Calendar data synced to Google Calendar is stored in the user's own Google account. That data is governed by Google's privacy policy and by the user's Google Calendar sharing settings.

Cycle does not send Google Calendar data to developer-owned servers.

## Google Account Permissions

Cycle requests Google Calendar access only to provide calendar sync.

The policy should describe the active Google Calendar scopes in plain language. At the time this outline was written, the app used access for:

- Reading calendar information needed to find and read period-related events.
- Creating, updating, and deleting period-related calendar events.

Cycle does not use Google Calendar access for ads, analytics, profiling, resale, or marketing.

## Export, Import, and Sharing

Users may export their Cycle data.

Exported files may contain sensitive health information. Users should store exported files carefully and share them only with people or services they trust.

If a user shares exported data using Android's share sheet, the destination app or service selected by the user receives that data. Cycle does not control how the selected destination handles shared data.

Users may import previously exported data back into Cycle.

## Deleting Data

Cycle includes a "Delete all data" control in Settings.

The implemented delete-all-data flow deletes:

- Local cycle data.
- Deleted-event sync tracking.
- Local sync metadata.
- Stored Google auth tokens by signing the user out of Google in Cycle.
- The local Google Calendar sync enabled state.

The implemented delete-all-data flow preserves visual preferences, including appearance, accent color, and font.

The implemented delete-all-data flow does not delete existing Google Calendar events. The confirmation copy tells users to remove those events in Google Calendar if they want them gone. The public privacy policy should continue to match this behavior exactly.

## Analytics, Ads, Tracking, and Notifications

Cycle does not include advertising SDKs.

Cycle does not include third-party analytics SDKs.

Cycle does not use push notifications.

Cycle does not operate a backend server.

Google Play may provide aggregate store and platform metrics to the developer through Play Console, such as installs, uninstalls, ratings, crashes, and application-not-responding reports. These are Google Play platform metrics, not in-app analytics collected by Cycle.

## Crash Reporting

Cycle may use crash reporting to diagnose and improve app stability.

If Cycle relies only on Google Play Console / Android vitals, crash and application-not-responding reports may be available to the developer for users who have opted in to Android usage and diagnostics sharing. These reports should be used only to diagnose and improve app stability.

If a separate crash reporting SDK, such as Firebase Crashlytics or Sentry, is added later, this policy and the Google Play Data Safety form must be updated before release.

## Security

Cycle's local data is protected by the user's device and Android operating system security.

Google Calendar sync uses Google OAuth and HTTPS connections to Google APIs.

Users should protect their device with a lock screen and protect their Google account credentials.

The public policy should avoid claims such as "end-to-end encrypted" unless that is specifically implemented and verified.

## Third Parties

Cycle does not share user cycle data with developer-owned servers or advertising partners.

Data may be processed by Google when the user:

- Installs or updates Cycle through Google Play.
- Uses Google Play services or Play Console-supported platform features.
- Enables Google Calendar sync.
- Stores synced period events in Google Calendar.

Data may also leave Cycle if the user exports data and shares it with another app or service.

## User Choices

Users can:

- Use Cycle without Google Calendar sync.
- Enable or disable Google Calendar sync.
- Export their data.
- Import their data.
- Delete local app data using the in-app delete-all-data control.
- Delete synced events directly in Google Calendar.
- Revoke Google access from their Google Account settings.

## Contact

Privacy and support contact:

contact@cycleapp.org

## Open Release Checklist Items

- Confirm the committed `android:allowBackup="false"` change remains present in the final release branch.
- Keep the implemented "Delete all data" flow and privacy policy aligned: local records, sync metadata, tombstones, and Google auth tokens are cleared; visual preferences are preserved; existing Google Calendar events are not deleted.
- Confirm final Google Calendar OAuth scopes and reflect them in the policy.
- Confirm whether crash reporting is limited to Google Play Console / Android vitals or uses a separate SDK.
- Keep the Google Play Data Safety form consistent with this policy.
