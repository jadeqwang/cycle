import { describe, test, expect } from 'vitest';
import { hasPeriodOn, addPeriodEntry } from './CycleApp.jsx';

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
