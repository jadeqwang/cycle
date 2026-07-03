import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./auth.js', () => ({
  getAccessToken: vi.fn(async () => 'token-1'),
}));

vi.mock('./gcal.js', () => ({
  findPeriodCalendar: vi.fn(async () => 'calendar-1'),
  listPeriodEvents: vi.fn(async () => [
    { id: 'remote-start', summary: 'period start', date: '2026-06-03', updated: '2026-06-04T00:00:00Z' },
    { id: 'remote-end', summary: 'period end', date: '2026-06-07', updated: '2026-06-04T00:00:00Z' },
    { id: 'future-start', summary: 'period start', date: '2026-07-23', updated: '2026-06-04T00:00:00Z' },
  ]),
  insertAllDayEvent: vi.fn(async (_token, _calendarId, summary) => (
    summary === 'period start' ? 'created-start' : 'created-end'
  )),
  patchEventDate: vi.fn(async () => {}),
  deleteEvent: vi.fn(async () => {}),
}));

vi.mock('./sync-config.js', () => ({
  SYNC_CONFIG: {
    clientId: 'client-1.apps.googleusercontent.com',
    calendarName: 'Period Tracker',
    calendarId: 'calendar-1',
  },
}));

const gcal = await import('./gcal.js');
const { runSync } = await import('./run-sync.js');

describe('runSync', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-02T12:00:00Z'));
    vi.clearAllMocks();
  });

  test('pulls only through tomorrow, applies the sync plan, and stores created event ids', async () => {
    const result = await runSync({
      periods: [
        {
          start: '2026-06-28',
          end: '2026-07-02',
          startEventId: null,
          endEventId: null,
          updatedAt: '2026-06-30T00:00:00Z',
        },
      ],
      deletedEventIds: ['remote-start', 'remote-end'],
    });

    expect(gcal.listPeriodEvents).toHaveBeenCalledWith(
      'token-1',
      'calendar-1',
      '2024-07-02T00:00:00Z',
      '2026-07-03T00:00:00Z',
    );
    expect(gcal.deleteEvent).toHaveBeenCalledWith('token-1', 'calendar-1', 'remote-start');
    expect(gcal.deleteEvent).toHaveBeenCalledWith('token-1', 'calendar-1', 'remote-end');
    expect(gcal.insertAllDayEvent).toHaveBeenCalledWith('token-1', 'calendar-1', 'period start', '2026-06-28');
    expect(gcal.insertAllDayEvent).toHaveBeenCalledWith('token-1', 'calendar-1', 'period end', '2026-07-02');
    expect(result.periods).toEqual([
      {
        start: '2026-06-28',
        end: '2026-07-02',
        startEventId: 'created-start',
        endEventId: 'created-end',
        updatedAt: '2026-06-30T00:00:00Z',
      },
    ]);
    expect(result.clearedTombstones).toEqual(['remote-start', 'remote-end']);
    expect(result.syncedAt).toBe('2026-07-02T12:00:00.000Z');
  });

  test('does not adopt a remote event dated UTC-today when it is local-tomorrow', async () => {
    vi.setSystemTime(new Date('2026-07-02T02:00:00Z'));
    gcal.listPeriodEvents.mockResolvedValueOnce([
      { id: 'remote-tomorrow', summary: 'period start', date: '2026-07-02', updated: '2026-07-02T00:00:00Z' },
    ]);

    const result = await runSync({
      periods: [],
      deletedEventIds: [],
      todayStr: '2026-07-01',
    });

    expect(gcal.listPeriodEvents).toHaveBeenCalledWith(
      'token-1',
      'calendar-1',
      '2024-07-01T00:00:00Z',
      '2026-07-02T00:00:00Z',
    );
    expect(result.periods).toEqual([]);
  });

  test('keeps a local-today entry with a matching remote event before UTC midnight', async () => {
    vi.setSystemTime(new Date('2026-07-01T22:00:00Z'));
    gcal.listPeriodEvents.mockResolvedValueOnce([
      { id: 'remote-start', summary: 'period start', date: '2026-07-02', updated: '2026-07-02T00:00:00Z' },
    ]);

    const result = await runSync({
      periods: [
        {
          start: '2026-07-02',
          end: null,
          startEventId: 'remote-start',
          endEventId: null,
          updatedAt: '2026-07-02T01:00:00Z',
        },
      ],
      deletedEventIds: [],
      todayStr: '2026-07-02',
    });

    expect(result.periods).toEqual([
      {
        start: '2026-07-02',
        end: null,
        startEventId: 'remote-start',
        endEventId: null,
        updatedAt: '2026-07-02T01:00:00Z',
      },
    ]);
  });

  test('patches a remote event when the local date conflict is newer', async () => {
    gcal.listPeriodEvents.mockResolvedValueOnce([
      { id: 'remote-start', summary: 'period start', date: '2026-06-03', updated: '2026-06-04T00:00:00Z' },
      { id: 'remote-end', summary: 'period end', date: '2026-06-07', updated: '2026-06-04T00:00:00Z' },
    ]);

    const result = await runSync({
      periods: [
        {
          start: '2026-06-04',
          end: '2026-06-07',
          startEventId: 'remote-start',
          endEventId: 'remote-end',
          updatedAt: '2026-06-05T00:00:00Z',
        },
      ],
      deletedEventIds: [],
      todayStr: '2026-07-02',
    });

    expect(gcal.patchEventDate).toHaveBeenCalledWith('token-1', 'calendar-1', 'remote-start', '2026-06-04');
    expect(gcal.insertAllDayEvent).not.toHaveBeenCalled();
    expect(result.periods).toEqual([
      {
        start: '2026-06-04',
        end: '2026-06-07',
        startEventId: 'remote-start',
        endEventId: 'remote-end',
        updatedAt: '2026-06-05T00:00:00Z',
      },
    ]);
  });

  test('rejects when the second create fails so callers do not apply sync results', async () => {
    const createError = new Error('create failed');
    gcal.listPeriodEvents.mockResolvedValueOnce([]);
    gcal.insertAllDayEvent
      .mockResolvedValueOnce('created-start')
      .mockRejectedValueOnce(createError);

    await expect(runSync({
      periods: [
        {
          start: '2026-06-28',
          end: '2026-07-02',
          startEventId: null,
          endEventId: null,
          updatedAt: '2026-06-30T00:00:00Z',
        },
      ],
      deletedEventIds: ['remote-start'],
      todayStr: '2026-07-02',
    })).rejects.toThrow('create failed');

    expect(gcal.insertAllDayEvent).toHaveBeenCalledTimes(2);
    expect(gcal.insertAllDayEvent).toHaveBeenNthCalledWith(
      1,
      'token-1',
      'calendar-1',
      'period start',
      '2026-06-28',
    );
    expect(gcal.insertAllDayEvent).toHaveBeenNthCalledWith(
      2,
      'token-1',
      'calendar-1',
      'period end',
      '2026-07-02',
    );
  });
});
