import type { MonthlyPlanDetailDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { datesOfMonth, monthlyPlanCsv, monthlyPlanFilename } from './monthlyPlanCsv';

const day = (planDate: string, over: Partial<MonthlyPlanDetailDto['entries'][number]> = {}): MonthlyPlanDetailDto['entries'][number] => ({
  planDate,
  workingType: 'FIELD_WORK',
  dayKind: 'NORMAL',
  workWith: [],
  routeIds: ['r1'],
  remarks: null,
  returnDate: null,
  ...over,
});
type PlanLike = Pick<MonthlyPlanDetailDto, 'planMonth' | 'entries' | 'offDays' | 'routes' | 'status'>;
const plan = (over: Partial<PlanLike> = {}): PlanLike => ({
  planMonth: '2026-11',
  status: 'APPROVED',
  entries: [],
  offDays: [],
  routes: [{ id: 'r1', name: 'Naxalbari', routeType: 'HQ' }, { id: 'o1', name: 'Siliguri', routeType: 'OUT_STATION' }],
  ...over,
});
const names = { routeLabel: (id: string) => `SLG-1 · ${id}`, personName: (id: string) => `Person ${id}` };
const rows = (csv: string) => csv.trimEnd().split('\r\n').map((l) => l.split(','));

describe('monthlyPlanCsv', () => {
  it('lists every calendar day of the month', () => {
    expect(datesOfMonth('2026-02')).toHaveLength(28);
    const out = rows(monthlyPlanCsv(plan(), names));
    expect(out).toHaveLength(31);
    expect(out[1]![0]).toBe('2026-11-01');
    expect(out[1]![1]).toBe('Sunday');
    expect(out[1]![2]).toBe('Not planned');
  });

  it('names planned days, locked days and the holiday', () => {
    const out = rows(
      monthlyPlanCsv(
        plan({
          entries: [day('2026-11-02', { workWith: ['u1', 'u2'], remarks: 'Camp' })],
          offDays: [{ date: '2026-11-01', reason: 'WEEKLY_OFF', name: null }, { date: '2026-11-05', reason: 'HOLIDAY', name: 'Bhai Phota' }],
        }),
        names,
      ),
    );
    expect(out[1]!.slice(2, 4)).toEqual(['Weekly off', '']);
    expect(out[2]!.slice(2)).toEqual(['Planned', '', 'Field work', 'Normal', 'SLG-1 · r1', 'HQ', 'Person u1; Person u2', 'Camp', '', 'APPROVED']);
    expect(out[5]!.slice(2, 4)).toEqual(['Holiday', 'Bhai Phota']);
  });

  it('keeps a trip’s stay and return days and the return date', () => {
    const csv = monthlyPlanCsv(
      plan({ entries: [day('2026-11-02', { routeIds: ['o1'], returnDate: '2026-11-04' }), day('2026-11-03', { routeIds: ['o1'], dayKind: 'STAY' }), day('2026-11-04', { routeIds: ['o1'], dayKind: 'TRANSIT' })] }),
      names,
    );
    const out = rows(csv);
    expect(out[2]![10]).toBe('2026-11-04');
    expect(out[2]![7]).toBe('Out-station');
    expect(out[3]![5]).toBe('Stay (DA only)');
  });

  it('quotes remarks with commas and quotes, and neutralises a formula', () => {
    const csv = monthlyPlanCsv(plan({ entries: [day('2026-11-02', { remarks: 'a, "b"' }), day('2026-11-03', { remarks: '=1+1' })] }), names);
    expect(csv).toContain('"a, ""b"""');
    expect(csv).toContain("'=1+1");
  });

  it('names the file after the employee and month', () => {
    expect(monthlyPlanFilename('GHC014', '2026-11')).toBe('monthly-plan-ghc014-2026-11.csv');
  });
});
