import { describe, test, expect } from 'vitest';
import { hasPeriodOn, addPeriodEntry, setLastPeriodDate } from './CycleApp.jsx';

const d = (y, m, day) => new Date(y, m - 1, day);

describe('hasPeriodOn', () => {
  test('returns true when a period starts on the given day', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    expect(hasPeriodOn(periods, d(2026, 7, 2))).toBe(true);
  });

  test('returns false when no period starts on the given day', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    expect(hasPeriodOn(periods, d(2026, 7, 1))).toBe(false);
  });

  test('returns false for an empty list', () => {
    expect(hasPeriodOn([], d(2026, 7, 2))).toBe(false);
  });
});

describe('addPeriodEntry', () => {
  test('adds a new date and keeps the list sorted', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    const result = addPeriodEntry(periods, d(2026, 6, 20));
    expect(result.map(x => x.getTime())).toEqual(
      [d(2026, 6, 3), d(2026, 6, 20), d(2026, 7, 2)].map(x => x.getTime()),
    );
  });

  test('does not add a duplicate of an already-logged day', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    const result = addPeriodEntry(periods, d(2026, 7, 2));
    expect(result).toHaveLength(2);
    expect(result.map(x => x.getTime())).toEqual(periods.map(x => x.getTime()));
  });
});

describe('setLastPeriodDate', () => {
  test('replaces the date of the most recent entry', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    const result = setLastPeriodDate(periods, d(2026, 6, 30));
    expect(result.map(x => x.getTime())).toEqual(
      [d(2026, 6, 3), d(2026, 6, 30)].map(x => x.getTime()),
    );
  });

  test('works when there is only one entry', () => {
    const result = setLastPeriodDate([d(2026, 7, 2)], d(2026, 6, 28));
    expect(result.map(x => x.getTime())).toEqual([d(2026, 6, 28).getTime()]);
  });

  test('no-ops when the new date collides with another entry', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    const result = setLastPeriodDate(periods, d(2026, 6, 3));
    expect(result.map(x => x.getTime())).toEqual(periods.map(x => x.getTime()));
  });

  test('no-ops on an empty list', () => {
    expect(setLastPeriodDate([], d(2026, 7, 2))).toEqual([]);
  });
});
