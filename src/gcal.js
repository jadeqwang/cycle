const BASE = 'https://www.googleapis.com/calendar/v3';

export class GcalError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function gfetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new GcalError(res.status, await res.text().catch(() => res.statusText));
  }
  return res.json();
}

export async function findPeriodCalendar(token, config) {
  if (config.calendarId) {
    try {
      const cal = await gfetch(token, `/calendars/${encodeURIComponent(config.calendarId)}`);
      return cal.id;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  let pageToken = '';
  do {
    const page = await gfetch(token, `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${pageToken}` : ''}`);
    const hit = (page.items || []).find(c => c.summary === config.calendarName);
    if (hit) return hit.id;
    pageToken = page.nextPageToken;
  } while (pageToken);

  const created = await gfetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: config.calendarName }),
  });
  return created.id;
}

export async function listPeriodEvents(token, calendarId, timeMinIso, timeMaxIso) {
  const events = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'false',
      maxResults: '250',
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    for (const ev of page.items || []) {
      if (ev.status === 'cancelled') continue;
      const date = (ev.start?.date || ev.start?.dateTime || '').slice(0, 10);
      if (date) events.push({ id: ev.id, summary: ev.summary || '', date, updated: ev.updated });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

function nextDay(date) {
  const d = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000);
  return d.toISOString().slice(0, 10);
}

export async function insertAllDayEvent(token, calendarId, summary, date) {
  const ev = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({ summary, start: { date }, end: { date: nextDay(date) } }),
  });
  return ev.id;
}

export async function patchEventDate(token, calendarId, eventId, date) {
  await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ start: { date }, end: { date: nextDay(date) } }),
  });
}

export async function deleteEvent(token, calendarId, eventId) {
  try {
    await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}
