import { getAccessToken } from './auth.js';
import {
  findPeriodCalendar,
  listPeriodEvents,
  insertAllDayEvent,
  patchEventDate,
  deleteEvent,
} from './gcal.js';
import { pairRemoteEvents, planSync } from './sync.js';
import { SYNC_CONFIG } from './sync-config.js';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export async function runSync({ periods, deletedEventIds }) {
  const token = await getAccessToken(SYNC_CONFIG.clientId);
  const calendarId = await findPeriodCalendar(token, SYNC_CONFIG);

  const now = new Date();
  const todayStr = isoDate(now);
  const twoYearsAgo = isoDate(new Date(now.getTime() - 2 * 365 * 86400000));
  const earliest = periods[0]?.start;
  const timeMin = earliest && earliest < twoYearsAgo ? earliest : twoYearsAgo;
  const timeMax = isoDate(new Date(now.getTime() + 86400000));

  const events = await listPeriodEvents(token, calendarId, `${timeMin}T00:00:00Z`, `${timeMax}T00:00:00Z`);
  const remote = pairRemoteEvents(events, todayStr);
  const plan = planSync({ local: periods, remote, deletedEventIds, timeMin });

  for (const eventId of plan.pushDeletes) {
    await deleteEvent(token, calendarId, eventId);
  }
  for (const update of plan.pushUpdates) {
    await patchEventDate(token, calendarId, update.eventId, update.date);
  }
  for (const create of plan.pushCreates) {
    const eventId = await insertAllDayEvent(
      token,
      calendarId,
      create.kind === 'start' ? 'period start' : 'period end',
      create.date,
    );
    const entry = plan.localPeriods.find(period => period.start === create.localStart);
    if (entry) {
      entry[create.kind === 'start' ? 'startEventId' : 'endEventId'] = eventId;
    }
  }

  return {
    periods: plan.localPeriods,
    clearedTombstones: plan.clearedTombstones,
    syncedAt: new Date().toISOString(),
  };
}
