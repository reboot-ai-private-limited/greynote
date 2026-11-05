import { beforeEach, describe, expect, it } from 'vitest';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import { SalesClock } from '../salesClock.js';
import { FakeLines, FakeMaster, FakeRollups, FakeUsers, config } from './salesTestKit.js';
import { makeSecondaryRollupStatusHandler, ReadSecondaryRollupUseCase, SubmitSecondaryRollupUseCase } from './secondaryRollup.usecase.js';

type Req = { id: string; kind: string; recordId: string; status: string; cycle: number; decidedAt: Date | null };
const asm = { id: 'asm', role: 'FIELD' };
const now = new Date('2026-09-30T10:00:00+05:30');

describe('a manager’s team report', () => {
  const clock = new SalesClock(config, () => now);
  const run = { run: <T>(fn: (ctx: undefined) => Promise<T>) => fn(undefined) };
  let lines: FakeLines;
  let rollups: FakeRollups;
  let requests: Req[];
  let submitted: string[];
  let approvals: SalesApprovalsPort;
  let submit: SubmitSecondaryRollupUseCase;
  let read: ReadSecondaryRollupUseCase;
  const approve = (mr: string, cycle = 1) => {
    requests = requests.filter((r) => r.recordId !== `${mr}:2026-09`);
    requests.push({ id: `rq-${mr}-${cycle}`, kind: 'SECONDARY_SALES', recordId: `${mr}:2026-09`, status: 'APPROVED', cycle, decidedAt: new Date(`2026-09-2${cycle}T08:00:00Z`) });
  };
  const enter = async (mr: string, issued: number, status: 'APPROVED' | 'DRAFT' = 'APPROVED') => lines.upsertMany(mr, '2026-09', [{ distributorId: 'dist1', productId: 'prod1', openingQty: 10, primaryQty: 20, issuedQty: issued }], status, now);

  beforeEach(() => {
    lines = new FakeLines();
    rollups = new FakeRollups();
    requests = [];
    submitted = [];
    approvals = {
      submit: async (i: { kind: string; recordId: string }) => (submitted.push(`${i.kind}:${i.recordId}`), { id: 'rq-rollup' }),
      listForRecords: async (kind: string, ids: string[]) => requests.filter((r) => r.kind === kind && ids.includes(r.recordId)),
    } as unknown as SalesApprovalsPort;
    submit = new SubmitSecondaryRollupUseCase(new FakeUsers(), lines, rollups, approvals, run, clock, config);
    read = new ReadSecondaryRollupUseCase(new FakeUsers(), new FakeMaster(), lines, rollups, approvals);
  });

  it('sums only the MRs whose report is approved: MR 2 + MR 4 = 6; the other is listed, adding nothing', async () => {
    await enter('mr1', 2);
    approve('mr1');
    await enter('mr2', 4, 'DRAFT');
    requests.push({ id: 'rq-mr2', kind: 'SECONDARY_SALES', recordId: 'mr2:2026-09', status: 'SUBMITTED', cycle: 1, decidedAt: null });
    expect(await submit.execute(asm, '2026-09')).toEqual({ requestId: 'rq-rollup', mrReports: 1 });
    expect(submitted).toEqual(['SECONDARY_SALES:asm:2026-09:team']);
    const saved = await rollups.find('asm', '2026-09');
    expect(saved).toMatchObject({ status: 'PENDING', requestId: 'rq-rollup', designation: { name: 'ASM', level: 2 }, lines: [{ distributorId: 'dist1', productId: 'prod1', issuedQty: 2 }] });
    expect(saved!.sources.map((s) => [s.mrUserId, s.status, s.requestId, s.issuedQty])).toEqual([['mr1', 'APPROVED', 'rq-mr1-1', 2], ['mr2', 'SUBMITTED', 'rq-mr2', 0]]);
    // once mr2 is approved too, the next send holds both: 2 + 4 = 6
    await rollups.setStatus({ userId: 'asm', month: '2026-09' }, ['PENDING'], 'REJECTED');
    await lines.setStatus({ userId: 'mr2', month: '2026-09' }, ['DRAFT'], 'APPROVED');
    approve('mr2');
    await submit.execute(asm, '2026-09');
    const again = await read.execute(asm, { userId: 'asm', month: '2026-09' });
    expect(again.totals.issuedQty).toBe(6);
    expect(again.approvedMrCount).toBe(2);
  });

  it('is only for a manager with MRs; refuses nothing approved and a month already sent', async () => {
    await expect(submit.execute({ id: 'mr1', role: 'FIELD' }, '2026-09')).rejects.toMatchObject({ code: 'MANAGER_ONLY' });
    await expect(submit.execute({ id: 'admin', role: 'ADMIN' }, '2026-09')).rejects.toMatchObject({ code: 'MANAGER_ONLY' });
    await expect(submit.execute(asm, '2026-09')).rejects.toMatchObject({ code: 'SECONDARY_NOTHING_TO_SEND' });
    await enter('mr1', 2);
    approve('mr1');
    await submit.execute(asm, '2026-09');
    await expect(submit.execute(asm, '2026-09')).rejects.toMatchObject({ code: 'SECONDARY_LOCKED' });
    await expect(submit.execute(asm, '2026-10')).rejects.toMatchObject({ code: 'MONTH_NOT_STARTED' });
  });

  it('approving freezes it, rejecting or reopening unlocks it', async () => {
    await enter('mr1', 2);
    approve('mr1');
    await submit.execute(asm, '2026-09');
    const handle = makeSecondaryRollupStatusHandler(rollups, () => now);
    await handle({ recordId: 'asm:2026-09:team', status: 'APPROVED' }, undefined as never);
    expect(await rollups.find('asm', '2026-09')).toMatchObject({ status: 'APPROVED', approvedAt: now });
    expect((await rollups.listRange({ fromMonth: '2026-09', toMonth: '2026-09' })).map((r) => r.userId)).toEqual(['asm']);
    await handle({ recordId: 'asm:2026-09:team', status: 'REOPENED' }, undefined as never);
    expect(await rollups.find('asm', '2026-09')).toMatchObject({ status: 'DRAFT', approvedAt: null });
    expect(await rollups.listRange({ fromMonth: '2026-09', toMonth: '2026-09' })).toEqual([]);
    await submit.execute(asm, '2026-09');
    await handle({ recordId: 'asm:2026-09:team', status: 'REJECTED' }, undefined as never);
    expect((await rollups.find('asm', '2026-09'))!.status).toBe('REJECTED');
  });

  it('reads the live sum before sending and the saved snapshot after; an MR report that changes makes it out of date', async () => {
    await enter('mr1', 2);
    approve('mr1');
    const before = await read.execute(asm, { userId: 'asm', month: '2026-09' });
    expect(before).toMatchObject({ status: 'NOT_SUBMITTED', saved: false, canSubmit: true, outOfDate: false, designation: null, mrCount: 2, approvedMrCount: 1 });
    await submit.execute(asm, '2026-09');
    const sent = await read.execute(asm, { userId: 'asm', month: '2026-09' });
    expect(sent).toMatchObject({ status: 'PENDING', saved: true, canSubmit: false, outOfDate: false, designation: { name: 'ASM' }, totals: { issuedQty: 2 } });
    // mr2 gets approved afterwards: the saved figures do not move, they are flagged
    await enter('mr2', 4);
    approve('mr2');
    const stale = await read.execute(asm, { userId: 'asm', month: '2026-09' });
    expect(stale).toMatchObject({ outOfDate: true, totals: { issuedQty: 2 } });
    // an MR report reopened and approved again (a new round) is also out of date
    await rollups.setStatus({ userId: 'asm', month: '2026-09' }, ['PENDING'], 'REJECTED');
    await submit.execute(asm, '2026-09');
    approve('mr1', 2);
    expect((await read.execute(asm, { userId: 'asm', month: '2026-09' })).outOfDate).toBe(true);
  });

  it('is open to the manager, the manager above and Admin, and not to a stranger or to Admin as submitter', async () => {
    await read.execute(asm, { userId: 'asm', month: '2026-09' });
    await read.execute({ id: 'admin', role: 'ADMIN' }, { userId: 'asm', month: '2026-09' });
    await expect(read.execute({ id: 'mr2', role: 'FIELD' }, { userId: 'asm', month: '2026-09' })).rejects.toMatchObject({ code: 'NOT_YOUR_TEAM' });
    expect((await read.execute({ id: 'admin', role: 'ADMIN' }, { userId: 'asm', month: '2026-09' })).canSubmit).toBe(false);
  });
});
