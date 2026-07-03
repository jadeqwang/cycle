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

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addLocalDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function addLocalYears(value, years) {
  const date = parseLocalDate(value);
  date.setFullYear(date.getFullYear() + years);
  return localDateString(date);
}

export async function runSync({ periods, deletedEventIds, todayStr = localDateString(new Date()) }) {
  const token = await getAccessToken(SYNC_CONFIG.clientId);
  const calendarId = await findPeriodCalendar(token, SYNC_CONFIG);

  const twoYearsAgo = addLocalYears(todayStr, -2);
  const earliest = periods[0]?.start;
  const timeMin = earliest && earliest < twoYearsAgo ? earliest : twoYearsAgo;
  const timeMax = addLocalDays(todayStr, 1);

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
