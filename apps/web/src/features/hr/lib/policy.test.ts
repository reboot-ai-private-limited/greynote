import type { LeaveTypeDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { buildPolicyGrid, readCell } from './policy';

const types: LeaveTypeDto[] = [
  { id: 'casual', name: 'Casual', isPaid: true, active: true },
  { id: 'sick', name: 'Sick', isPaid: true, active: true },
  { id: 'lop', name: 'Loss of Pay', isPaid: false, active: true },
  { id: 'old', name: 'Old', isPaid: true, active: false },
];
const bands = [{ id: 'g2', name: 'G2' }, { id: 'g1', name: 'G1' }];

describe('buildPolicyGrid', () => {
  const grid = buildPolicyGrid(bands, types, [{ payBandId: 'g1', leaveTypeId: 'casual', defaultDays: 12 }, { payBandId: 'g2', leaveTypeId: 'sick', defaultDays: 7.5 }]);
  it('has a column for each active paid type only', () => {
    expect(grid.columns.map((c) => c.name)).toEqual(['Casual', 'Sick']);
  });
  it('has a row for each grade, sorted by name', () => {
    expect(grid.rows.map((r) => r.name)).toEqual(['G1', 'G2']);
  });
  it('fills each cell with the days set, or null where none has been', () => {
    expect(grid.rows[0]?.cells.map((c) => c.days)).toEqual([12, null]);
    expect(grid.rows[1]?.cells.map((c) => c.days)).toEqual([null, 7.5]);
  });
  it('is empty with no grades or no paid types', () => {
    expect(buildPolicyGrid([], types, []).rows).toEqual([]);
    expect(buildPolicyGrid(bands, [types[2]!], []).columns).toEqual([]);
  });
});

describe('readCell', () => {
  it('means a change when the number differs, and nothing when it is the same', () => {
    expect(readCell('15', 12)).toEqual({ ok: true, days: 15 });
    expect(readCell('12', 12)).toEqual({ ok: true, days: null });
    expect(readCell(' 12.0 ', 12)).toEqual({ ok: true, days: null });
  });
  it('sets a first value, including zero', () => {
    expect(readCell('10', null)).toEqual({ ok: true, days: 10 });
    expect(readCell('0', null)).toEqual({ ok: true, days: 0 });
  });
  it('leaves a blank cell alone where nothing was set, but refuses to blank one that was', () => {
    expect(readCell('', null)).toEqual({ ok: true, days: null });
    expect(readCell('', 12)).toMatchObject({ ok: false });
  });
  it('refuses a bad number with the reason', () => {
    expect(readCell('1.3', null)).toEqual({ ok: false, error: 'Use whole or half days only.' });
    expect(readCell('400', null)).toMatchObject({ ok: false });
  });
});
