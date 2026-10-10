import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DcrClock } from '../dcrClock.js';
import type { ExpenseMonthRecord, ExpenseMonthRepositoryPort } from '../../domain/records.repository.port.js';
import type { ProofStoragePort } from '../../domain/proofStorage.port.js';
import { ExpenseProof } from '../expenseProof.js';
import { ExpenseMonthService, EXPENSE_MONTH_KIND } from './expenseMonth.usecase.js';
import { faKit, Tx } from './faTestKit.js';

class FakeMonths implements ExpenseMonthRepositoryPort {
  rows: ExpenseMonthRecord[] = [];
  async find(userId: string, month: string) {
    return this.rows.find((r) => r.userId === userId && r.month === month) ?? null;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async markSubmitted(userId: string, month: string, totals: { taPaise: number; daPaise: number; otherPaise: number }, at: Date) {
    const row = (await this.find(userId, month)) ?? { id: `em-${this.rows.length + 1}`, userId, month, status: 'DRAFT' as const, submittedAt: null, taPaise: 0, daPaise: 0, otherPaise: 0 };
    Object.assign(row, { status: 'SUBMITTED', submittedAt: at, ...totals });
    if (!this.rows.includes(row)) this.rows.push(row);
    return row;
  }
  async listForUsers(userIds: string[], month: string) {
    return this.rows.filter((r) => userIds.includes(r.userId) && r.month === month);
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
  let svc: ExpenseMonthService;
  const MR = { id: 'mr1', role: 'FIELD' as const };

  beforeEach(() => {
    kit = faKit(); // 2026-10-05, so September is over and October is not
    months = new FakeMonths();
    svc = new ExpenseMonthService(kit.expenses, months, kit.users, kit.approvals, new DcrClock(kit.config, () => kit.clock.current), kit.config, { run: (fn) => fn(new Tx()) }, storage);
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
    kit.approvals.setStatus(record.id, 'APPROVED', EXPENSE_MONTH_KIND);
    expect((await svc.statement(MR, 'mr1', '2026-09')).status).toBe('APPROVED');
    expect((await kit.markPaid.execute('acct', kit.expenses.rows[1]!.id)).paymentStatus).toBe('PAID');

    await svc.onStatusChange(record.id, 'REJECTED', new Tx());
    expect(kit.expenses.rows[0]).toMatchObject({ monthApproved: false });
    expect(kit.expenses.rows[1]).toMatchObject({ paymentStatus: 'PAID', monthApproved: true }); // the paid one is left
    kit.approvals.setStatus(record.id, 'REJECTED', EXPENSE_MONTH_KIND);
    expect(await svc.statement(MR, 'mr1', '2026-09')).toMatchObject({ status: 'REJECTED', editable: true });
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
