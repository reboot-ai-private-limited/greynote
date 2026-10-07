import type { DcrMonthDto, DcrMrRowDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { callsPerDayText, confirmedPercent, dcrCoverageCsv, dcrDefaultMonth, dcrEmployeesCsv, dcrMonthsCsv, dcrRowsOfMonth, dcrYearFilename, latePercent } from './dcr';

const f = { reportedDays: 20, lateDays: 2, doctorCalls: 100, chemistCalls: 40, followups: 5, calls: 140, callsPerDay: 7, geofence: { pass: 120, fail: 6, unverified: 4, override: 10 }, unconfirmed: 10 };
const month = (over: Partial<DcrMonthDto> = {}): DcrMonthDto => ({ month: '2026-04', state: 'ENDED', employees: 2, ...f, ...over });
const row = (over: Partial<DcrMrRowDto> = {}): DcrMrRowDto => ({ month: '2026-04', mr: { id: 'u1', name: 'Asha Rao', employeeCode: 'MR001' }, ...f, ...over });

describe('dcrRowsOfMonth', () => {
  it('keeps the month\'s employees, most calls first', () => {
    const rows = [row({ calls: 10 }), row({ mr: { id: 'u2', name: 'Bimal', employeeCode: 'MR002' }, calls: 90 }), row({ month: '2026-05', calls: 999 })];
    expect(dcrRowsOfMonth({ rows }, '2026-04').map((r) => r.mr.name)).toEqual(['Bimal', 'Asha Rao']);
  });
});

describe('dcrDefaultMonth', () => {
  it('is the latest month with a reported day, else the latest started, else nothing', () => {
    expect(dcrDefaultMonth([month({ month: '2026-04' }), month({ month: '2026-05' }), month({ month: '2026-06', reportedDays: 0 }), month({ month: '2026-07', state: 'FUTURE', reportedDays: 0 })])).toBe('2026-05');
    expect(dcrDefaultMonth([month({ month: '2026-04', reportedDays: 0 })])).toBe('2026-04');
    expect(dcrDefaultMonth([])).toBe('');
  });
});

describe('the shares', () => {
  it('are whole percents, and nothing to say without calls or days', () => {
    expect(confirmedPercent(f)).toBe(93); // (120 + 10) / 140
    expect(confirmedPercent({ calls: 0, geofence: { pass: 0, fail: 0, unverified: 0, override: 0 } })).toBeNull();
    expect(latePercent(f)).toBe(10);
    expect(latePercent({ reportedDays: 0, lateDays: 0 })).toBeNull();
    expect(callsPerDayText(f)).toBe('7.0');
    expect(callsPerDayText({ callsPerDay: null })).toBe('—');
  });
});

describe('the CSVs', () => {
  it('the year: a row per started month, calls per day empty when there are no days', () => {
    const lines = dcrMonthsCsv({ months: [month(), month({ month: '2026-05', reportedDays: 0, callsPerDay: null }), month({ month: '2026-06', state: 'FUTURE' })] }).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('Apr 26,2,20,2,100,40,5,7,120,10,4,6');
    expect(lines[2]).toBe('May 26,2,0,2,100,40,5,,120,10,4,6');
  });
  it('the employees of a month, and the doctors not visited', () => {
    expect(dcrEmployeesCsv([row()]).trimEnd().split('\r\n')[1]).toBe('Apr 26,MR001,Asha Rao,20,2,100,40,5,7,120,10,4,6');
    expect(dcrCoverageCsv({ notVisited: [{ id: 'd1', name: 'Dr Sen, MD', specialty: 'ENT' }] }).trimEnd().split('\r\n')[1]).toBe('"Dr Sen, MD",ENT');
    expect(dcrYearFilename(2026)).toBe('dcr-2026-27.csv');
  });
});
