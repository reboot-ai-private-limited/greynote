import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DcrClock } from '../dcrClock.js';
import { ExpenseMonthDeadlines } from '../expenseMonthDeadlines.js';
import type { ExpenseMonthGrant } from '../../domain/expenseMonthGrant.entity.js';
import type { ExpenseMonthGrantRepositoryPort } from '../../domain/expenseMonthGrant.repository.port.js';
import { GrantExpenseMonthUseCase } from './expenseMonthGrants.usecase.js';
import type { ProofStoragePort } from '../../domain/proofStorage.port.js';
import { ExpenseProof } from '../expenseProof.js';
import { ExpenseMonthService, EXPENSE_MONTH_KIND } from './expenseMonth.usecase.js';
import { FakeExpenseMonths as FakeMonths, faKit, Tx } from './faTestKit.js';

class FakeGrants implements ExpenseMonthGrantRepositoryPort {
  rows: ExpenseMonthGrant[] = [];
  async findById(id: string) {
    return this.rows.find((g) => g.id === id) ?? null;
  }
  async listUsableForMonth(month: string, now: Date) {
    return this.rows.filter((g) => g.month === month && g.status === 'OPEN' && g.expiresAt > now);
  }
  async findUsable(userId: string, month: string, phase: ExpenseMonthGrant['phase'], now: Date) {
    return this.rows.find((g) => g.userId === userId && g.month === month && g.phase === phase && g.status === 'OPEN' && g.expiresAt > now) ?? null;
  }
  async create(input: Omit<ExpenseMonthGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date) {
    if (await this.findUsable(input.userId, input.month, input.phase, now)) return null;
    const grant: ExpenseMonthGrant = { ...input, id: `g-${this.rows.length + 1}`, status: 'OPEN', usedAt: null, revokedAt: null, revokedBy: null };
    this.rows.push(grant);
    return grant;
  }
  async consume(id: string, now: Date) {
    const g = this.rows.find((x) => x.id === id);
    if (!g || g.status !== 'OPEN' || g.expiresAt <= now) return false;
    Object.assign(g, { status: 'USED', usedAt: now });
    return true;
  }
  async revoke() {
    return null;
  }
  async list() {
    return { items: this.rows, total: this.rows.length };
  }
}

async function code(p: Promise<unknown>) {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).publicDetails as { code?: string } | undefined;
}

class FakeStorage implements ProofStoragePort {
  files = new Set<string>();
  private n = 0;
  async upload() {
    const publicId = `file-${++this.n}`;
    this.files.add(publicId);
    return { url: `https://files/${publicId}`, publicId };
  }
  async remove(publicId: string) {
    this.files.delete(publicId);
  }
}
const storage = new FakeStorage();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe('the monthly expense statement (decision-log 2026-10-10)', () => {
  let kit: ReturnType<typeof faKit>;
  let months: FakeMonths;
  let grants: FakeGrants;
  let grant: GrantExpenseMonthUseCase;
  let svc: ExpenseMonthService;
  const MR = { id: 'mr1', role: 'FIELD' as const };

  beforeEach(() => {
    kit = faKit(); // 2026-10-05, so September is over and October is not
    months = new FakeMonths();
    grants = new FakeGrants();
    svc = new ExpenseMonthService(kit.expenses, months, kit.users, kit.approvals, new DcrClock(kit.config, () => kit.clock.current), kit.config, { run: (fn) => fn(new Tx()) }, storage, grants, new ExpenseMonthDeadlines(kit.config, () => kit.clock.current));
    grant = new GrantExpenseMonthUseCase(grants, kit.expenses, kit.users, kit.config, () => kit.clock.current);
  });

  const seedAuto = (date: string, type: 'TA' | 'DA', amountPaise: number) =>
    kit.expenses.create({ dcrId: `dcr-${date}`, userId: 'mr1', reportDate: date, routeId: null, type, source: 'AUTO', amountPaise, remarks: null, paymentStatus: 'UNPAID', accepted: true, monthApproved: false, distanceFlag: false, paidBy: null, paidAt: null, clientId: null, recordedAt: new Date() }, new Tx());

  it('shows each date with its TA, DA and own Other entries, and the totals', async () => {
    await seedAuto('2026-09-10', 'TA', 8000);
    await seedAuto('2026-09-10', 'DA', 20000);
    await svc.addOther('mr1', { reportDate: '2026-09-10', amountPaise: 1500, remarks: 'parking' });
    await svc.addOther('mr1', { reportDate: '2026-09-12', amountPaise: 700, remarks: null });
    const s = await svc.statement(MR, 'mr1', '2026-09');
    expect(s.days.map((d) => [d.date, d.taPaise, d.daPaise, d.otherPaise, d.totalPaise])).toEqual([['2026-09-10', 8000, 20000, 1500, 29500], ['2026-09-12', 0, 0, 700, 700]]);
    expect(s.totals).toEqual({ taPaise: 8000, daPaise: 20000, otherPaise: 2200, totalPaise: 30200 });
    expect(s).toMatchObject({ status: 'DRAFT', editable: true, monthEnded: true, canSubmit: true });
  });

  it('cannot be submitted, or approved, before the month is over — and no future-dated entry', async () => {
    await svc.addOther('mr1', { reportDate: '2026-10-02', amountPaise: 500, remarks: null });
    expect((await svc.statement(MR, 'mr1', '2026-10')).canSubmit).toBe(false);
    expect(await code(svc.submit('mr1', '2026-10'))).toMatchObject({ code: 'MONTH_NOT_ENDED' });
    await expect(svc.addOther('mr1', { reportDate: '2026-10-09', amountPaise: 500, remarks: null })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses an empty month, then locks the entries once submitted', async () => {
    await code(svc.submit('mr1', '2026-09'));
    await svc.addOther('mr1', { reportDate: '2026-09-10', amountPaise: 1500, remarks: null });
    expect((await svc.submit('mr1', '2026-09')).status).toBe('SUBMITTED');
    expect(await code(svc.addOther('mr1', { reportDate: '2026-09-11', amountPaise: 1, remarks: null }))).toMatchObject({ code: 'EXPENSE_MONTH_LOCKED' });
    const id = kit.expenses.rows[0]!.id;
    expect(await code(svc.deleteOther('mr1', id))).toMatchObject({ code: 'EXPENSE_MONTH_LOCKED' });
  });

  it('approval makes the rows payable and accepts the Other entries; sending back reverses it and reopens editing', async () => {
    await seedAuto('2026-09-10', 'TA', 8000);
    await svc.addOther('mr1', { reportDate: '2026-09-10', amountPaise: 1500, remarks: null });
    await svc.submit('mr1', '2026-09');
    const record = months.rows[0]!;
    await svc.onStatusChange(record.id, 'APPROVED', new Tx());
    expect(kit.expenses.rows.map((r) => [r.type, r.monthApproved, r.accepted])).toEqual([['TA', true, true], ['OTHER', true, true]]);
    await kit.expenses.setMonthFinalized('mr1', { from: '2026-09-01', to: '2026-09-30' }, new Tx()); // paying needs a finalized month
    kit.approvals.setStatus(record.id, 'APPROVED', EXPENSE_MONTH_KIND);
    expect((await svc.statement(MR, 'mr1', '2026-09')).status).toBe('APPROVED');
    expect((await kit.markPaid.execute('acct', kit.expenses.rows[1]!.id)).paymentStatus).toBe('PAID');

    await svc.onStatusChange(record.id, 'REJECTED', new Tx());
    expect(kit.expenses.rows[0]).toMatchObject({ monthApproved: false });
    expect(kit.expenses.rows[1]).toMatchObject({ paymentStatus: 'PAID', monthApproved: true }); // the paid one is left
    kit.approvals.setStatus(record.id, 'REJECTED', EXPENSE_MONTH_KIND);
    expect(await svc.statement(MR, 'mr1', '2026-09')).toMatchObject({ status: 'REJECTED', editable: true });
  });

  describe('deadlines and the late exception (decision-log 2026-10-12)', () => {
    const ADMIN = { id: 'admin', role: 'ADMIN' as const };
    // The September statement is due on the 7th of October (default) and approvable until the 10th.
    beforeEach(async () => {
      await svc.addOther('mr1', { reportDate: '2026-09-10', amountPaise: 1500, remarks: null });
    });

    it('shows both deadlines and lets the month be sent on the last day', async () => {
      kit.clock.current = new Date('2026-10-07T12:00:00+05:30');
      const s = await svc.statement(MR, 'mr1', '2026-09');
      expect(s.deadlines.submitBy).toBe(new Date('2026-10-07T23:59:59.999+05:30').toISOString());
      expect(s).toMatchObject({ submitLate: false, canSubmit: true });
      expect((await svc.submit('mr1', '2026-09')).status).toBe('SUBMITTED');
    });

    it('refuses a late submit without an exception, and reports it cannot be submitted', async () => {
      kit.clock.current = new Date('2026-10-08T09:00:00+05:30');
      expect(await svc.statement(MR, 'mr1', '2026-09')).toMatchObject({ submitLate: true, canSubmit: false });
      expect(await code(svc.submit('mr1', '2026-09'))).toMatchObject({ code: 'EXPENSE_SUBMIT_LATE' });
    });

    it('lets a late submit through once with an Admin exception, then needs a new one', async () => {
      kit.clock.current = new Date('2026-10-08T09:00:00+05:30');
      await grant.execute(ADMIN, { userId: 'mr1', month: '2026-09', phase: 'SUBMIT', reason: 'was on leave' });
      expect((await svc.statement(MR, 'mr1', '2026-09')).canSubmit).toBe(true);
      expect((await svc.submit('mr1', '2026-09')).status).toBe('SUBMITTED');
      expect(grants.rows[0]!.status).toBe('USED');
      await svc.onStatusChange(months.rows[0]!.id, 'REJECTED', new Tx());
      kit.approvals.setStatus(months.rows[0]!.id, 'REJECTED', EXPENSE_MONTH_KIND);
      expect(await code(svc.submit('mr1', '2026-09'))).toMatchObject({ code: 'EXPENSE_SUBMIT_LATE' });
    });

    it('refuses a late approval without an exception and allows it with one', async () => {
      await svc.submit('mr1', '2026-09');
      const id = months.rows[0]!.id;
      kit.clock.current = new Date('2026-10-11T09:00:00+05:30');
      expect(await code(svc.onStatusChange(id, 'APPROVED', new Tx()))).toMatchObject({ code: 'EXPENSE_APPROVAL_LATE' });
      expect(kit.expenses.rows[0]).toMatchObject({ monthApproved: false });
      await grant.execute(ADMIN, { userId: 'mr1', month: '2026-09', phase: 'APPROVE', reason: 'manager travelling' });
      await svc.onStatusChange(id, 'APPROVED', new Tx());
      expect(kit.expenses.rows[0]).toMatchObject({ monthApproved: true });
      expect(grants.rows[0]!.status).toBe('USED');
    });

    it('does not grant an exception once any of the month is paid, and a manager only while allowed', async () => {
      await svc.submit('mr1', '2026-09');
      await svc.onStatusChange(months.rows[0]!.id, 'APPROVED', new Tx());
      await kit.expenses.setMonthFinalized('mr1', { from: '2026-09-01', to: '2026-09-30' }, new Tx());
      await kit.markPaid.execute('acct', kit.expenses.rows[0]!.id);
      kit.clock.current = new Date('2026-10-12T09:00:00+05:30');
      expect(await code(grant.execute(ADMIN, { userId: 'mr1', month: '2026-09', phase: 'APPROVE', reason: 'x' }))).toMatchObject({ code: 'EXPENSE_MONTH_PAID' });
      expect(await code(svc.onStatusChange(months.rows[0]!.id, 'REOPENED', new Tx()))).toMatchObject({ code: 'EXPENSE_MONTH_PAID' });
    });

    it('lets a manager grant only for their team and only while the toggle is on', async () => {
      kit.clock.current = new Date('2026-10-08T09:00:00+05:30');
      await expect(grant.execute({ id: 'asm', role: 'FIELD' }, { userId: 'mr1', month: '2026-09', phase: 'SUBMIT', reason: 'x' })).rejects.toMatchObject({ statusCode: 403 });
      kit.config.values['LATE_EXPENSE_GRANT_BY_MANAGER'] = 'true';
      await expect(grant.execute({ id: 'mr2', role: 'FIELD' }, { userId: 'mr1', month: '2026-09', phase: 'SUBMIT', reason: 'x' })).rejects.toMatchObject({ statusCode: 403 });
      expect((await grant.execute({ id: 'asm', role: 'FIELD' }, { userId: 'mr1', month: '2026-09', phase: 'SUBMIT', reason: 'x' })).status).toBe('OPEN');
    });
  });

  it('is readable by the owner, a manager above them and Admin only', async () => {
    await svc.statement({ id: 'asm', role: 'FIELD' }, 'mr1', '2026-09');
    await svc.statement({ id: 'admin', role: 'ADMIN' }, 'mr1', '2026-09');
    await expect(svc.statement({ id: 'mr2', role: 'FIELD' }, 'mr1', '2026-09')).rejects.toMatchObject({ statusCode: 403 });
  });
  describe('proof on an Other expense', () => {
    let proof: ExpenseProof;
    let id: string;
    beforeEach(async () => {
      storage.files.clear();
      proof = new ExpenseProof(kit.expenses, svc, storage);
      id = (await svc.addOther('mr1', { reportDate: '2026-09-10', amountPaise: 1500, remarks: 'parking' })).id;
    });
    const file = (buffer: Buffer = PNG) => ({ buffer, name: 'receipt.png' });

    it('attaches a file, shows it on the statement without its storage id, and removes it', async () => {
      const files = await proof.add('mr1', id, file());
      expect(files).toEqual([expect.objectContaining({ fileName: 'receipt.png', mimeType: 'image/png', sizeBytes: PNG.length })]);
      expect(files[0]).not.toHaveProperty('publicId');
      const day = (await svc.statement(MR, 'mr1', '2026-09')).days[0]!;
      expect(day.others[0]!.attachments).toHaveLength(1);
      expect(await proof.remove('mr1', id, files[0]!.id)).toEqual([]);
      expect(storage.files.size).toBe(0);
    });

    it('refuses an empty file, a file that is not a PDF/JPG/PNG, and a fourth file', async () => {
      expect((await proof.add('mr1', id, file(Buffer.alloc(0))).catch((e: unknown) => e)) as AppError).toBeInstanceOf(AppError);
      expect((await proof.add('mr1', id, file(Buffer.from('hello'))).catch((e: unknown) => e)) as AppError).toBeInstanceOf(AppError);
      for (let i = 0; i < 3; i++) await proof.add('mr1', id, file());
      expect(((await proof.add('mr1', id, file()).catch((e: unknown) => e)) as AppError).statusCode).toBe(409);
      expect(storage.files.size).toBe(3);
    });

    it('is the owner’s alone, and not for a row that is not an Other expense', async () => {
      expect(((await proof.add('mr2', id, file()).catch((e: unknown) => e)) as AppError).statusCode).toBe(404);
      const auto = await kit.expenses.create({ dcrId: 'dcr-1', userId: 'mr1', reportDate: '2026-09-11', routeId: null, type: 'TA', source: 'AUTO', amountPaise: 100, remarks: null, paymentStatus: 'UNPAID', accepted: true, monthApproved: false, distanceFlag: false, paidBy: null, paidAt: null, clientId: null, recordedAt: new Date() }, new Tx());
      expect(((await proof.add('mr1', auto.id, file()).catch((e: unknown) => e)) as AppError).statusCode).toBe(404);
    });

    it('is locked once the month is sent for approval', async () => {
      await svc.submit('mr1', '2026-09');
      expect(((await proof.add('mr1', id, file()).catch((e: unknown) => e)) as AppError).statusCode).toBe(409);
    });

    it('goes with the expense when it is deleted', async () => {
      await proof.add('mr1', id, file());
      await svc.deleteOther('mr1', id);
      expect(storage.files.size).toBe(0);
    });
  });
});
