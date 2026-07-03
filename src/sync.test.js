import { describe, test, expect } from 'vitest';
import { pairRemoteEvents, planSync } from './sync.js';

const ev = (id, summary, date, updated = '2026-01-01T00:00:00Z') => ({ id, summary, date, updated });
const le = (start, extra = {}) => ({
  start, end: null, startEventId: null, endEventId: null,
  updatedAt: '2026-01-01T00:00:00Z', ...extra,
});

describe('pairRemoteEvents', () => {
  test('pairs starts with the first end before the next start', () => {
    const out = pairRemoteEvents([
      ev('s1', 'period start', '2026-06-03'),
      ev('e1', 'period end', '2026-06-07'),
      ev('s2', 'period start', '2026-06-28'),
      ev('e2', 'period end', '2026-07-02'),
    ], '2026-07-02');
    expect(out).toEqual([
      { start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-01-01T00:00:00Z' },
      { start: '2026-06-28', end: '2026-07-02', startEventId: 's2', endEventId: 'e2', updated: '2026-01-01T00:00:00Z' },
    ]);
  });

  test('drops future projections and unknown summaries', () => {
    const out = pairRemoteEvents([
      ev('s1', 'period start', '2026-06-28'),
      ev('s2', 'period start', '2026-07-23'),
      ev('e2', 'period end', '2026-07-27'),
      ev('x', 'dentist', '2026-06-29'),
    ], '2026-07-02');
    expect(out).toEqual([
      { start: '2026-06-28', end: null, startEventId: 's1', endEventId: null, updated: '2026-01-01T00:00:00Z' },
    ]);
  });

  test('does not pair an end more than 14 days after the start', () => {
    const out = pairRemoteEvents([
      ev('s1', 'period start', '2026-05-01'),
      ev('e1', 'period end', '2026-05-20'),
    ], '2026-07-02');
    expect(out[0].end).toBeNull();
  });
});

describe('planSync', () => {
  const args = (over = {}) => ({ local: [], remote: [], deletedEventIds: [], timeMin: '2024-07-02', ...over });

  test('local-only entry without ids is pushed as creates', () => {
    const p = planSync(args({ local: [le('2026-06-28', { end: '2026-07-02' })] }));
    expect(p.pushCreates).toEqual([
      { kind: 'start', date: '2026-06-28', localStart: '2026-06-28' },
      { kind: 'end', date: '2026-07-02', localStart: '2026-06-28' },
    ]);
    expect(p.localPeriods).toHaveLength(1);
  });

  test('remote-only entry is adopted locally', () => {
    const p = planSync(args({ remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-06-04T00:00:00Z' }] }));
    expect(p.localPeriods).toEqual([
      { start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updatedAt: '2026-06-04T00:00:00Z' },
    ]);
    expect(p.pushCreates).toEqual([]);
  });

  test('tombstoned remote entry is deleted remotely, not re-adopted', () => {
    const p = planSync(args({
      remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-01-01T00:00:00Z' }],
      deletedEventIds: ['s1', 'e1'],
    }));
    expect(p.pushDeletes.sort()).toEqual(['e1', 's1']);
    expect(p.localPeriods).toEqual([]);
    expect(p.clearedTombstones.sort()).toEqual(['e1', 's1']);
  });

  test('matched by id, local newer -> push update', () => {
    const p = planSync(args({
      local: [le('2026-06-05', { startEventId: 's1', updatedAt: '2026-06-10T00:00:00Z' })],
      remote: [{ start: '2026-06-03', end: null, startEventId: 's1', endEventId: null, updated: '2026-06-01T00:00:00Z' }],
    }));
    expect(p.pushUpdates).toEqual([{ eventId: 's1', date: '2026-06-05' }]);
    expect(p.localPeriods[0].start).toBe('2026-06-05');
  });

  test('matched by id, remote newer -> adopt remote date', () => {
    const p = planSync(args({
      local: [le('2026-06-05', { startEventId: 's1', updatedAt: '2026-06-01T00:00:00Z' })],
      remote: [{ start: '2026-06-03', end: null, startEventId: 's1', endEventId: null, updated: '2026-06-10T00:00:00Z' }],
    }));
    expect(p.pushUpdates).toEqual([]);
    expect(p.localPeriods[0].start).toBe('2026-06-03');
  });

  test('local end added after remote (no end event) -> push end create; remote end adopted when local lacks one', () => {
    const p1 = planSync(args({
      local: [le('2026-06-03', { startEventId: 's1', end: '2026-06-07', updatedAt: '2026-06-10T00:00:00Z' })],
      remote: [{ start: '2026-06-03', end: null, startEventId: 's1', endEventId: null, updated: '2026-06-01T00:00:00Z' }],
    }));
    expect(p1.pushCreates).toEqual([{ kind: 'end', date: '2026-06-07', localStart: '2026-06-03' }]);
    const p2 = planSync(args({
      local: [le('2026-06-03', { startEventId: 's1' })],
      remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-06-10T00:00:00Z' }],
    }));
    expect(p2.localPeriods[0].end).toBe('2026-06-07');
    expect(p2.localPeriods[0].endEventId).toBe('e1');
  });

  test('entry with id missing remotely inside window -> deleted locally; outside window -> kept', () => {
    const inWindow = planSync(args({
      local: [le('2026-06-03', { startEventId: 'gone', endEventId: 'gone-e' })],
    }));
    expect(inWindow.localPeriods).toEqual([]);
    expect(inWindow.pushDeletes).toEqual(['gone-e']);
    const outOfWindow = planSync(args({
      local: [le('2023-08-11', { startEventId: 'old' })],
      timeMin: '2024-07-02',
    }));
    expect(outOfWindow.localPeriods).toHaveLength(1);
  });

  test('id-less local entry matching a remote date adopts its ids', () => {
    const p = planSync(args({
      local: [le('2026-06-03')],
      remote: [{ start: '2026-06-03', end: '2026-06-07', startEventId: 's1', endEventId: 'e1', updated: '2026-06-04T00:00:00Z' }],
    }));
    expect(p.localPeriods).toHaveLength(1);
    expect(p.localPeriods[0].startEventId).toBe('s1');
    expect(p.pushCreates).toEqual([]);
  });
});
