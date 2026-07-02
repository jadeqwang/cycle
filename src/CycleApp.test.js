import { afterEach, describe, test, expect } from 'vitest';
import {
  hasPeriodOn, addPeriodEntry, setPeriodDate, setPeriodEnd, removePeriodAt,
  makeEntry, collectEventIds, autoPeriodLen, parseStoredEntry,
  serializeEntry, buildBackupState, loadStoredState, saveStoredState, mergeImportedPeriods,
} from './CycleApp.jsx';

const d = (y, m, day) => new Date(y, m - 1, day);
const entry = (start, extra = {}) => ({
  start, end: null, startEventId: null, endEventId: null,
  updatedAt: '2026-01-01T00:00:00Z', ...extra,
});
const STORAGE_KEY = 'cycle-app.state.v1';
const originalWindow = globalThis.window;

function installLocalStorage(initial = {}) {
  const store = { ...initial };
  globalThis.window = {
    localStorage: {
      getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: key => { delete store[key]; },
      clear: () => {
        Object.keys(store).forEach(key => { delete store[key]; });
      },
    },
  };
  return store;
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe('hasPeriodOn', () => {
  test('matches entry start days', () => {
    const periods = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    expect(hasPeriodOn(periods, d(2026, 7, 2))).toBe(true);
    expect(hasPeriodOn(periods, d(2026, 7, 1))).toBe(false);
    expect(hasPeriodOn([], d(2026, 7, 2))).toBe(false);
  });
});

describe('addPeriodEntry', () => {
  test('appends a fresh entry sorted by start', () => {
    const periods = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    const result = addPeriodEntry(periods, d(2026, 6, 20));

    expect(result.map(x => x.start.getTime())).toEqual(
      [d(2026, 6, 3), d(2026, 6, 20), d(2026, 7, 2)].map(x => x.getTime()),
    );
    expect(result[1].end).toBeNull();
    expect(result[1].startEventId).toBeNull();
    expect(typeof result[1].updatedAt).toBe('string');
  });

  test('no-ops on an existing day', () => {
    const periods = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    const result = addPeriodEntry(periods, d(2026, 7, 2));
    expect(result).toBe(periods);
  });
});

describe('setPeriodDate', () => {
  test('moves start, keeps ids, and bumps updatedAt', () => {
    const periods = [
      entry(d(2026, 6, 3)),
      entry(d(2026, 7, 2), { startEventId: 'start-id', endEventId: 'end-id' }),
    ];
    const result = setPeriodDate(periods, 1, d(2026, 6, 30));

    expect(result.map(x => x.start.getTime())).toEqual(
      [d(2026, 6, 3), d(2026, 6, 30)].map(x => x.getTime()),
    );
    expect(result[1].startEventId).toBe('start-id');
    expect(result[1].endEventId).toBe('end-id');
    expect(result[1].updatedAt).not.toBe(periods[1].updatedAt);
  });

  test('no-ops on collision and out-of-range', () => {
    const periods = [entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];

    expect(setPeriodDate(periods, 1, d(2026, 6, 3))).toBe(periods);
    expect(setPeriodDate(periods, 3, d(2026, 6, 1))).toBe(periods);
    expect(setPeriodDate([], 0, d(2026, 6, 1))).toEqual([]);
  });
});

describe('setPeriodEnd', () => {
  test('sets and clears the end date', () => {
    const periods = [entry(d(2026, 7, 2))];

    const withEnd = setPeriodEnd(periods, 0, d(2026, 7, 6));
    expect(withEnd[0].end.getTime()).toBe(d(2026, 7, 6).getTime());
    expect(withEnd[0].updatedAt).not.toBe(periods[0].updatedAt);

    const cleared = setPeriodEnd(withEnd, 0, null);
    expect(cleared[0].end).toBeNull();
    expect(cleared[0].updatedAt).not.toBe(withEnd[0].updatedAt);
  });
});

describe('removePeriodAt', () => {
  test('removes by index', () => {
    const periods = [entry(d(2026, 5, 6)), entry(d(2026, 6, 3)), entry(d(2026, 7, 2))];
    const result = removePeriodAt(periods, 1);
    expect(result.map(x => x.start.getTime())).toEqual(
      [d(2026, 5, 6), d(2026, 7, 2)].map(x => x.getTime()),
    );
  });

  test('returns original array object for out-of-range', () => {
    const periods = [entry(d(2026, 7, 2))];
    expect(removePeriodAt(periods, 5)).toBe(periods);
  });
});

describe('collectEventIds', () => {
  test('returns only non-null ids', () => {
    expect(collectEventIds(entry(d(2026, 7, 2), {
      startEventId: 'start-id',
      endEventId: null,
    }))).toEqual(['start-id']);
    expect(collectEventIds(entry(d(2026, 7, 2), {
      startEventId: 'start-id',
      endEventId: 'end-id',
    }))).toEqual(['start-id', 'end-id']);
    expect(collectEventIds(entry(d(2026, 7, 2), {
      startEventId: '',
      endEventId: null,
    }))).toEqual(['']);
  });
});

describe('autoPeriodLen', () => {
  test('is the median length of the last 5 ended entries', () => {
    const periods = [
      entry(d(2026, 1, 1), { end: d(2026, 1, 5) }),
      entry(d(2026, 2, 1), { end: d(2026, 2, 3) }),
      entry(d(2026, 3, 1), { end: d(2026, 3, 4) }),
      entry(d(2026, 4, 1), { end: d(2026, 4, 8) }),
      entry(d(2026, 5, 1), { end: d(2026, 5, 6) }),
      entry(d(2026, 6, 1), { end: d(2026, 6, 7) }),
    ];

    expect(autoPeriodLen(periods)).toBe(6);
  });

  test('returns null with no ended entries', () => {
    expect(autoPeriodLen([entry(d(2026, 7, 2))])).toBeNull();
  });
});

describe('parseStoredEntry', () => {
  test('migrates a v1 date string', () => {
    const result = parseStoredEntry('2026-07-02');
    expect(result.start.getTime()).toBe(d(2026, 7, 2).getTime());
    expect(result.end).toBeNull();
    expect(result.startEventId).toBeNull();
    expect(result.endEventId).toBeNull();
    expect(typeof result.updatedAt).toBe('string');
  });

  test('parses a v2 object with all fields', () => {
    const result = parseStoredEntry({
      start: '2026-07-02',
      end: '2026-07-06',
      startEventId: 'start-id',
      endEventId: 'end-id',
      updatedAt: '2026-07-07T00:00:00.000Z',
    });

    expect(result).toEqual({
      start: d(2026, 7, 2),
      end: d(2026, 7, 6),
      startEventId: 'start-id',
      endEventId: 'end-id',
      updatedAt: '2026-07-07T00:00:00.000Z',
    });
  });

  test('returns null for garbage or bad start, and null end for bad end', () => {
    expect(parseStoredEntry(null)).toBeNull();
    expect(parseStoredEntry('not-a-date')).toBeNull();
    expect(parseStoredEntry({ start: 'bad-date' })).toBeNull();

    const result = parseStoredEntry({ start: '2026-07-02', end: 'bad-date' });
    expect(result.end).toBeNull();
  });
});

describe('serializeEntry', () => {
  test('serializes an entry to schema v2 date fields', () => {
    expect(serializeEntry(entry(d(2026, 7, 2), {
      end: d(2026, 7, 6),
      startEventId: 'start-id',
      endEventId: 'end-id',
      updatedAt: '2026-07-07T00:00:00.000Z',
    }))).toEqual({
      start: '2026-07-02',
      end: '2026-07-06',
      startEventId: 'start-id',
      endEventId: 'end-id',
      updatedAt: '2026-07-07T00:00:00.000Z',
    });
  });
});

describe('mergeImportedPeriods', () => {
  test('unions disjoint dates sorted', () => {
    const existing = [
      entry(d(2026, 7, 2)),
      entry(d(2026, 8, 28)),
    ];
    const incoming = [
      entry(d(2026, 6, 3)),
      entry(d(2026, 7, 30)),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result.map(x => x.start.getTime())).toEqual([
      d(2026, 6, 3),
      d(2026, 7, 2),
      d(2026, 7, 30),
      d(2026, 8, 28),
    ].map(x => x.getTime()));
  });

  test('same-date incoming fills missing end and ids', () => {
    const existing = [
      entry(d(2026, 7, 2), { updatedAt: '2026-07-03T00:00:00.000Z' }),
    ];
    const incoming = [
      entry(d(2026, 7, 2), {
        end: d(2026, 7, 6),
        startEventId: 'start-id',
        endEventId: 'end-id',
        updatedAt: '2026-07-02T00:00:00.000Z',
      }),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result).toEqual([
      entry(d(2026, 7, 2), {
        end: d(2026, 7, 6),
        startEventId: 'start-id',
        endEventId: 'end-id',
        updatedAt: '2026-07-03T00:00:00.000Z',
      }),
    ]);
  });

  test('newer incoming id conflicts replace existing ids', () => {
    const existing = [
      entry(d(2026, 7, 2), {
        startEventId: 'old-start-id',
        endEventId: 'old-end-id',
        updatedAt: '2026-07-03T00:00:00.000Z',
      }),
    ];
    const incoming = [
      entry(d(2026, 7, 2), {
        startEventId: 'new-start-id',
        endEventId: 'new-end-id',
        updatedAt: '2026-07-04T00:00:00.000Z',
      }),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result[0].startEventId).toBe('new-start-id');
    expect(result[0].endEventId).toBe('new-end-id');
  });

  test('older incoming id conflicts keep existing ids', () => {
    const existing = [
      entry(d(2026, 7, 2), {
        startEventId: 'existing-start-id',
        endEventId: 'existing-end-id',
        updatedAt: '2026-07-04T00:00:00.000Z',
      }),
    ];
    const incoming = [
      entry(d(2026, 7, 2), {
        startEventId: 'older-start-id',
        endEventId: 'older-end-id',
        updatedAt: '2026-07-03T00:00:00.000Z',
      }),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result[0].startEventId).toBe('existing-start-id');
    expect(result[0].endEventId).toBe('existing-end-id');
  });

  test('incoming fills missing ids', () => {
    const existing = [
      entry(d(2026, 7, 2), {
        startEventId: null,
        endEventId: null,
        updatedAt: '2026-07-04T00:00:00.000Z',
      }),
    ];
    const incoming = [
      entry(d(2026, 7, 2), {
        startEventId: 'start-id',
        endEventId: 'end-id',
        updatedAt: '2026-07-03T00:00:00.000Z',
      }),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result[0].startEventId).toBe('start-id');
    expect(result[0].endEventId).toBe('end-id');
  });

  test('same-date conflict newer updatedAt wins per entry', () => {
    const existing = [
      entry(d(2026, 7, 2), {
        end: d(2026, 7, 5),
        updatedAt: '2026-07-05T00:00:00.000Z',
      }),
      entry(d(2026, 7, 30), {
        end: d(2026, 8, 2),
        updatedAt: '2026-08-03T00:00:00.000Z',
      }),
    ];
    const incoming = [
      entry(d(2026, 7, 2), {
        end: d(2026, 7, 6),
        updatedAt: '2026-07-06T00:00:00.000Z',
      }),
      entry(d(2026, 7, 30), {
        end: d(2026, 8, 3),
        updatedAt: '2026-08-02T00:00:00.000Z',
      }),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result[0].end.getTime()).toBe(d(2026, 7, 6).getTime());
    expect(result[0].updatedAt).toBe('2026-07-06T00:00:00.000Z');
    expect(result[1].end.getTime()).toBe(d(2026, 8, 2).getTime());
    expect(result[1].updatedAt).toBe('2026-08-03T00:00:00.000Z');
  });

  test('never removes existing entries', () => {
    const existing = [
      entry(d(2026, 7, 2)),
      entry(d(2026, 7, 30)),
    ];
    const incoming = [
      entry(d(2026, 7, 2), { end: d(2026, 7, 6) }),
    ];

    const result = mergeImportedPeriods(existing, incoming);

    expect(result.map(x => x.start.getTime())).toEqual([
      d(2026, 7, 2),
      d(2026, 7, 30),
    ].map(x => x.getTime()));
  });
});

describe('buildBackupState', () => {
  test('serializes full schema v2 backup metadata', () => {
    const backup = buildBackupState({
      periods: [
        entry(d(2026, 7, 2), {
          end: d(2026, 7, 6),
          startEventId: 'start-id',
          endEventId: 'end-id',
        }),
      ],
      deletedEventIds: ['gone-id'],
      lastSyncedAt: '2026-07-07T00:00:00.000Z',
      cycleLen: 29,
      cycleMode: 'auto',
      periodLen: 6,
      periodMode: 'manual',
      calSync: true,
      dark: true,
      accent: '#123456',
      font: 'karla',
    });

    expect(backup).toEqual({
      schema: 2,
      periods: [{
        start: '2026-07-02',
        end: '2026-07-06',
        startEventId: 'start-id',
        endEventId: 'end-id',
        updatedAt: '2026-01-01T00:00:00Z',
      }],
      deletedEventIds: ['gone-id'],
      lastSyncedAt: '2026-07-07T00:00:00.000Z',
      cycleLen: 29,
      cycleMode: 'auto',
      periodLen: 6,
      periodMode: 'manual',
      calSync: true,
      dark: true,
      accent: '#123456',
      font: 'karla',
    });
  });
});

describe('loadStoredState', () => {
  test('loads and sorts mixed v1 and v2 periods with sync defaults', () => {
    installLocalStorage({
      [STORAGE_KEY]: JSON.stringify({
        periods: [
          '2026-07-02',
          {
            start: '2026-06-01',
            end: '2026-06-05',
            startEventId: 'start-id',
            endEventId: 'end-id',
            updatedAt: '2026-06-06T00:00:00.000Z',
          },
          { start: 'bad-date', startEventId: 'skip-me' },
        ],
        cycleLen: 29,
        cycleMode: 'auto',
        periodLen: 6,
        periodMode: 'auto',
        calSync: true,
        dark: true,
        accent: '#A3B5A6',
        font: 'karla',
      }),
    });

    const result = loadStoredState();

    expect(result.periods.map(period => period.start.getTime())).toEqual([
      d(2026, 6, 1).getTime(),
      d(2026, 7, 2).getTime(),
    ]);
    expect(result.periods[0]).toEqual({
      start: d(2026, 6, 1),
      end: d(2026, 6, 5),
      startEventId: 'start-id',
      endEventId: 'end-id',
      updatedAt: '2026-06-06T00:00:00.000Z',
    });
    expect(result.cycleLen).toBe(29);
    expect(result.cycleMode).toBe('auto');
    expect(result.periodLen).toBe(6);
    expect(result.periodMode).toBe('auto');
    expect(result.calSync).toBe(true);
    expect(result.deletedEventIds).toEqual([]);
    expect(result.lastSyncedAt).toBeNull();
  });

  test('loads schema 2 deleted ids and last sync timestamp', () => {
    installLocalStorage({
      [STORAGE_KEY]: JSON.stringify({
        schema: 2,
        periods: [],
        deletedEventIds: ['deleted-start', null, 'deleted-end'],
        lastSyncedAt: '2026-07-07T00:00:00.000Z',
      }),
    });

    const result = loadStoredState();

    expect(result.deletedEventIds).toEqual(['deleted-start', 'deleted-end']);
    expect(result.lastSyncedAt).toBe('2026-07-07T00:00:00.000Z');
  });
});

describe('saveStoredState', () => {
  test('persists schema 2 with serialized entries and sync metadata defaults', () => {
    const store = installLocalStorage();

    saveStoredState({
      periods: [
        entry(d(2026, 7, 2), {
          end: d(2026, 7, 6),
          startEventId: 'start-id',
          endEventId: 'end-id',
          updatedAt: '2026-07-07T00:00:00.000Z',
        }),
      ],
      cycleLen: 27,
      cycleMode: 'manual',
      periodLen: 5,
      periodMode: 'manual',
      calSync: false,
    });

    expect(JSON.parse(store[STORAGE_KEY])).toEqual({
      periods: [{
        start: '2026-07-02',
        end: '2026-07-06',
        startEventId: 'start-id',
        endEventId: 'end-id',
        updatedAt: '2026-07-07T00:00:00.000Z',
      }],
      cycleLen: 27,
      cycleMode: 'manual',
      periodLen: 5,
      periodMode: 'manual',
      calSync: false,
      schema: 2,
      deletedEventIds: [],
      lastSyncedAt: null,
    });
  });
});

describe('makeEntry', () => {
  test('creates an entry with nullable sync fields', () => {
    const result = makeEntry(d(2026, 7, 2));
    expect(result.start.getTime()).toBe(d(2026, 7, 2).getTime());
    expect(result.end).toBeNull();
    expect(result.startEventId).toBeNull();
    expect(result.endEventId).toBeNull();
    expect(typeof result.updatedAt).toBe('string');
  });
});
