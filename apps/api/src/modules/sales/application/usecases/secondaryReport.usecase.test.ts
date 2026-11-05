import { describe, expect, it } from 'vitest';
import { FakeLines, FakeMaster, FakeUsers } from './salesTestKit.js';
import { ReadSecondaryReportUseCase } from './secondaryReport.usecase.js';

const at = new Date('2026-09-30T10:00:00Z');
const row = (d: string, p: string, o: number, pr: number, i: number) => ({ distributorId: d, productId: p, openingQty: o, primaryQty: pr, issuedQty: i });

describe('manager secondary report', () => {
  it('sums the approved MR rows once per distributor and product, with the MR breakdown and value at PTS; drafts and others are left out', async () => {
    const lines = new FakeLines();
    await lines.upsertMany('mr1', '2026-09', [row('dist1', 'prod1', 0, 10, 2)], 'APPROVED', at);
    await lines.upsertMany('mr2', '2026-09', [row('dist1', 'prod1', 5, 10, 4)], 'APPROVED', at);
    await lines.upsertMany('mr2', '2026-09', [row('dist1', 'prod2', 1, 1, 1)], 'DRAFT', at);
    const r = await new ReadSecondaryReportUseCase(new FakeUsers(), new FakeMaster(), lines).execute({ id: 'asm', role: 'FIELD' }, { month: '2026-09' });
    expect(r.mrCount).toBe(2);
    expect(r.approvedMrCount).toBe(2);
    const l = r.distributors[0]!.lines[0]!;
    expect([l.openingQty, l.primaryQty, l.issuedQty, l.closingQty]).toEqual([5, 20, 6, 19]);
    expect(l.issuedAmountPaise).toBe(6000);
    expect(l.byMr.map((m) => m.issuedQty)).toEqual([2, 4]);
    expect(r.totals.issuedQty).toBe(6);
    expect(r.distributors[0]!.lines).toHaveLength(1);
  });

  it('a manager never sees another team, and an MR is not a manager', async () => {
    const lines = new FakeLines();
    await lines.upsertMany('mr1', '2026-09', [row('dist1', 'prod1', 0, 10, 2)], 'APPROVED', at);
    const uc = new ReadSecondaryReportUseCase(new FakeUsers(), new FakeMaster(), lines);
    expect((await uc.execute({ id: 'mr2', role: 'FIELD' }, { month: '2026-09' })).distributors).toEqual([]);
    expect((await uc.execute({ id: 'admin', role: 'ADMIN' }, { month: '2026-09' })).totals.issuedQty).toBe(2);
  });
});
