# Cycle Closed Testing Plan

This plan prepares Cycle for Google Play closed testing. Jade owns tester recruitment, Play Console access, and final submission decisions. Agents can keep this document updated as testing results come in.

## Minimum Tester Requirement

Google Play requirements vary by account type and account history. New personal developer accounts may need at least 12 opted-in testers for 14 continuous days before production access is available. Confirm the Play Console requirement before scheduling a production launch.

## Tester Invitation Instructions

1. Create or open the Cycle app in Google Play Console.
2. Upload the signed release app bundle to an internal testing track first and complete a smoke test.
3. Create a closed testing track for the release candidate.
4. Add testers by email list or Google Group.
5. Share the opt-in URL from Play Console with each tester.
6. Ask testers to open the opt-in URL, accept the invitation, and install Cycle from Google Play.
7. Record each tester in the tracking table after they opt in.
8. Keep the same required testers opted in for the full continuous testing period if Play Console requires the 12 tester / 14 day path.
9. Send testers the scenario checklist, feedback questions, and bug report template below.

## Testing Scenarios

Ask each tester to run these scenarios on their primary Android device:

1. Onboarding: install Cycle from Play, open it for the first time, review the first-run experience, and confirm the app is understandable without prior setup help.
2. Logging: add a period entry with realistic start and end dates, then confirm predictions and summaries update as expected.
3. Editing: edit an existing period entry, change dates, save it, and confirm the timeline reflects the change.
4. Export/import: export Cycle data, verify a file is created, then import the same file and confirm data remains intact.
5. Delete all data: use the Delete All Data flow, confirm local period data is cleared, and confirm Google Calendar sync is disconnected if it was enabled.
6. Optional Google Calendar sync: connect Google Calendar, sync period events, edit or delete a Cycle period, and confirm Cycle only creates, updates, or deletes its own events.
7. Offline behavior: turn on airplane mode, open Cycle, log or edit data locally, then reconnect and confirm the app still behaves predictably.
8. App restart: force-stop Cycle, reopen it, and confirm logged data and settings persist.

## Tester Feedback Questions

Send these questions after the tester finishes the scenarios:

1. What Android device and Android version did you test on?
2. Did Cycle install and open from Google Play without errors?
3. Was the onboarding or first-use experience clear?
4. Were logging and editing period entries intuitive?
5. Did export/import work as expected?
6. Did Delete All Data clearly explain what would be removed and what would remain?
7. If you tested Google Calendar sync, did the permission prompt and sync behavior feel clear and trustworthy?
8. Did anything behave incorrectly after going offline, reconnecting, or restarting the app?
9. Did you notice confusing wording, privacy concerns, accessibility issues, or visual layout problems?
10. Would any issue prevent you from using or recommending this release?

## Bug Report Template

Use this template for every issue that might block release:

```text
Title:
Tester:
Device:
Android version:
Cycle version/build:
Date found:

Scenario:

Steps to reproduce:
1.
2.
3.

Expected result:

Actual result:

Frequency:
Always / Sometimes / Once

Severity:
Blocking / High / Medium / Low

Screenshots or screen recording:

Export file attached, if relevant:
Yes / No / Not applicable

Notes:
```

## Tracking Table

| Tester | Device | Android version | Opted-in date | Feedback received | Blocking issues |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |
| TBD | TBD | TBD | TBD | No | TBD |

## Exit Criteria

- Required testers, if any, have remained opted in for the required continuous period.
- Each required scenario has been tested on multiple Android versions when possible.
- All blocking and high severity issues have fixes or explicit launch decisions.
- Feedback has been reviewed against privacy policy, Data Safety, and Play listing claims.
- The final release candidate has passed the release verification checklist before promotion.
