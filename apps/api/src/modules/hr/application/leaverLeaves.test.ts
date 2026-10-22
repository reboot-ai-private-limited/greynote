import { describe, expect, it } from 'vitest';
import { LeaverLeaves } from './leaverLeaves.js';

describe('a leaver’s leave requests', () => {
  it('rejects those starting after the last working day still waiting; keeps one that starts by then, and decided ones', async () => {
    const leaves = [
      { id: 'spans', startDate: '2026-10-11', endDate: '2026-10-14' },
      { id: 'after', startDate: '2026-10-20', endDate: '2026-10-21' },
      { id: 'afterApproved', startDate: '2026-11-02', endDate: '2026-11-02' },
    ];
    const status = new Map([['spans', 'SUBMITTED'], ['after', 'SUBMITTED'], ['afterApproved', 'APPROVED']]);
    const rejected: Array<[string, string]> = [];
    const leaver = new LeaverLeaves(
      { listOverlapping: async (_u: string, from: string, to: string) => leaves.filter((l) => l.startDate <= to && l.endDate >= from) } as never,
      {
        listForRecords: async (_k: string, ids: string[]) => ids.map((recordId) => ({ recordId, status: status.get(recordId) })),
        autoReject: async (_k: string, id: string, reason: string) => {
          rejected.push([id, reason]);
          status.set(id, 'REJECTED');
          return true;
        },
      } as never,
    );
    expect(await leaver.count('mr1', '2026-10-12')).toBe(1);
    expect(await leaver.close('mr1', '2026-10-12')).toBe(1);
    expect(rejected).toEqual([['after', 'the employee left on 2026-10-12.']]);
    expect(await leaver.close('mr1', '2026-10-12')).toBe(0);
  });
});
