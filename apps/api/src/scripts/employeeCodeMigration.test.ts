import { describe, expect, it } from 'vitest';
import { planEmployeeCodes, type CodeRow } from './employeeCodeMigration.js';

const row = (id: string, employeeCode: string, joined: string | null, created = '2026-01-01'): CodeRow => ({
  id,
  employeeCode,
  dateOfJoining: joined ? new Date(joined) : null,
  createdAt: new Date(created),
});

describe('planEmployeeCodes', () => {
  it('numbers everyone by joining date, office staff and field alike', () => {
    const plan = planEmployeeCodes([row('c', 'GRN0011', '2026-03-01'), row('a', 'ADMIN', '2025-04-01'), row('b', 'GH101', '2025-09-01')]);
    expect(plan.changes).toEqual([
      { id: 'a', from: 'ADMIN', to: 'GHC001' },
      { id: 'b', from: 'GH101', to: 'GHC002' },
      { id: 'c', from: 'GRN0011', to: 'GHC003' },
    ]);
    expect(plan.lastSequence).toBe(3);
  });

  it('falls back to creation time, then id, when there is no joining date', () => {
    const plan = planEmployeeCodes([row('z', 'X1', null, '2026-02-01'), row('y', 'X2', null, '2026-01-01'), row('w', 'X3', '2026-05-01')]);
    expect(plan.changes.map((c) => c.id)).toEqual(['w', 'y', 'z']);
  });

  it('leaves GHC codes alone and continues after the highest, so a second run changes nothing', () => {
    const rows = [row('a', 'GHC001', '2025-01-01'), row('b', 'GHC005', '2025-02-01'), row('c', 'EMP05', '2025-03-01')];
    const plan = planEmployeeCodes(rows);
    expect(plan.changes).toEqual([{ id: 'c', from: 'EMP05', to: 'GHC006' }]);
    expect(planEmployeeCodes([row('a', 'GHC001', null), row('b', 'GHC005', null), row('c', 'GHC006', null)]).changes).toEqual([]);
  });
});
