import { describe, expect, it } from 'vitest';
import { carryByDay } from './carryByDay.js';

describe('carryByDay', () => {
  const rows = carryByDay([
    { date: '2026-11-02', plannedIds: ['a', 'b'], calledIds: ['a'] }, // b missed: owed from the 3rd
    { date: '2026-11-03', plannedIds: ['b', 'c'], calledIds: [] }, // b and c missed: b keeps its first day
    { date: '2026-11-04', plannedIds: [], calledIds: ['b', 'd'] }, // b called though not planned: cleared; d unplanned
    { date: '2026-11-05', plannedIds: ['c', 'c'], calledIds: ['c'] }, // planned twice, called: c cleared
  ]);

  it('carries a missed doctor in, keeping the day he was first planned', () => {
    expect(rows.map((r) => r.carriedIn)).toEqual([[], [{ id: 'b', since: '2026-11-02' }], [{ id: 'b', since: '2026-11-02' }, { id: 'c', since: '2026-11-03' }], [{ id: 'c', since: '2026-11-03' }]]);
  });

  it('visited, missed and called-though-unplanned, per day', () => {
    expect(rows.map((r) => [r.visited, r.missed, r.alsoCalled])).toEqual([[['a'], ['b'], []], [[], ['b', 'c'], []], [[], [], ['b', 'd']], [['c'], [], []]]);
  });

  it('a call on any later day clears the doctor, planned or not; carried on is what is owed at the end', () => {
    expect(rows.map((r) => r.carriedOn.map((x) => x.id))).toEqual([['b'], ['b', 'c'], ['c'], []]);
  });

  it('a person with nothing planned carries nothing', () => {
    expect(carryByDay([{ date: '2026-11-02', plannedIds: [], calledIds: [] }])[0]).toMatchObject({ carriedIn: [], carriedOn: [] });
  });
});
