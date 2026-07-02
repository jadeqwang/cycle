import { describe, test, expect } from 'vitest';
import { hasPeriodOn, addPeriodEntry, setPeriodDate, removePeriodAt } from './CycleApp.jsx';

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

describe('setPeriodDate', () => {
  test('replaces the entry at the given index', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    const result = setPeriodDate(periods, 1, d(2026, 6, 30));
    expect(result.map(x => x.getTime())).toEqual(
      [d(2026, 6, 3), d(2026, 6, 30)].map(x => x.getTime()),
    );
  });

  test('replaces a middle entry and keeps the list sorted', () => {
    const periods = [d(2026, 5, 6), d(2026, 6, 3), d(2026, 7, 2)];
    const result = setPeriodDate(periods, 1, d(2026, 6, 10));
    expect(result.map(x => x.getTime())).toEqual(
      [d(2026, 5, 6), d(2026, 6, 10), d(2026, 7, 2)].map(x => x.getTime()),
    );
  });

  test('no-ops when the new date collides with another entry', () => {
    const periods = [d(2026, 6, 3), d(2026, 7, 2)];
    const result = setPeriodDate(periods, 1, d(2026, 6, 3));
    expect(result.map(x => x.getTime())).toEqual(periods.map(x => x.getTime()));
  });

  test('no-ops when the index is out of range', () => {
    const periods = [d(2026, 7, 2)];
    expect(setPeriodDate(periods, 3, d(2026, 6, 1)).map(x => x.getTime()))
      .toEqual(periods.map(x => x.getTime()));
    expect(setPeriodDate([], 0, d(2026, 6, 1))).toEqual([]);
  });
});

describe('removePeriodAt', () => {
  test('removes the entry at the given index', () => {
    const periods = [d(2026, 5, 6), d(2026, 6, 3), d(2026, 7, 2)];
    const result = removePeriodAt(periods, 1);
    expect(result.map(x => x.getTime())).toEqual(
      [d(2026, 5, 6), d(2026, 7, 2)].map(x => x.getTime()),
    );
  });

  test('no-ops when the index is out of range', () => {
    const periods = [d(2026, 7, 2)];
    expect(removePeriodAt(periods, 5).map(x => x.getTime()))
      .toEqual(periods.map(x => x.getTime()));
  });
});
