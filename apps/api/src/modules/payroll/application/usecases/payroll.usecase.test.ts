import { beforeEach, describe, expect, it } from 'vitest';
import type { PayrollFilter, PayrollRunRepositoryPort, SaveDraftResult } from '../../domain/payroll.repository.port.js';
import { PAYROLL_CODES, PayrollRefusal } from '../../domain/payrollRefusal.js';
import type { PayrollAdjustment, PayrollDraft, PayrollRun } from '../../domain/payrollRun.entity.js';
import type { AttendancePort, HrPort, IdentityPort } from '../../domain/ports.js';
import { AdjustPayrollUseCase, PayPayrollUseCase, PayrollOverviewUseCase } from './payrollAdjust.usecase.js';
import { FinalizePayrollUseCase, GeneratePayrollUseCase, GetPayrollRunUseCase, ListPayrollRunsUseCase, PayrollClock } from './payroll.usecase.js';

class FakeRuns implements PayrollRunRepositoryPort {
  rows: PayrollRun[] = [];
  async saveDraft(d: PayrollDraft): Promise<SaveDraftResult> {
    const old = this.rows.find((r) => r.userId === d.userId && r.month === d.month);
    if (old?.status === 'FINALIZED') return { outcome: 'finalized' };
    if (old) return { outcome: 'updated', run: Object.assign(old, d) };
    const run: PayrollRun = { ...d, id: `p${this.rows.length + 1}`, status: 'DRAFT', finalizedAt: null, finalizedBy: null, paidAt: null, paidBy: null, paymentReference: null };
    this.rows.push(run);
    return { outcome: 'created', run };
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list(f: PayrollFilter) {
    return this.rows.filter((r) => (!f.month || r.month === f.month) && (!f.fromMonth || r.month >= f.fromMonth) && (!f.toMonth || r.month <= f.toMonth) && (!f.userId || r.userId === f.userId) && (!f.status || r.status === f.status));
  }
  async isFinalized(userId: string, month: string) {
    return this.rows.some((r) => r.userId === userId && r.month === month && r.status === 'FINALIZED');
  }
  async findByUserMonth(userId: string, month: string) {
    return this.rows.find((r) => r.userId === userId && r.month === month) ?? null;
  }
  async finalize(id: string, at: Date, by: string) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'DRAFT') return false;
    Object.assign(r, { status: 'FINALIZED', finalizedAt: at, finalizedBy: by });
    return true;
  }
  async saveAdjustments(id: string, expectedCount: number, next: { adjustments: PayrollAdjustment[]; adjustmentPaise: number; netPayablePaise: number }) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'DRAFT' || r.adjustments.length !== expectedCount) return false;
    Object.assign(r, next);
    return true;
  }
  async markPaid(id: string, by: string, at: Date, reference: string | null) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'FINALIZED' || r.paidAt) return false;
    Object.assign(r, { paidAt: at, paidBy: by, paymentReference: reference });
    return true;
  }
}

type Emp = { role?: string; status?: 'active' | 'inactive'; ctc?: boolean; base?: number; joined?: Date | null; unpaid?: number; esi?: string | null; deductible?: number };
class World implements IdentityPort, HrPort, AttendancePort {
  emps = new Map<string, Emp>();
  add(id: string, e: Emp = {}) {
    this.emps.set(id, e);
  }
  async listActiveFieldUserIds() {
    return [...this.emps].filter(([, e]) => (e.role ?? 'FIELD') === 'FIELD' && (e.status ?? 'active') === 'active').map(([id]) => id);
  }
  async getUserSummaries(ids: string[]) {
    return ids.filter((id) => this.emps.has(id)).map((id) => ({ id, name: `Name ${id}`, employeeCode: `E-${id}` }));
  }
  async findUserSummary(id: string) {
    const e = this.emps.get(id);
    return e ? { id, name: id, role: e.role ?? 'FIELD', status: e.status ?? 'active' } : null;
  }
  async getEmploymentDetails(id: string) {
    const e = this.emps.get(id);
    return e ? { dateOfJoining: e.joined ?? new Date('2024-01-01'), esiNumber: e.esi ?? null } : null;
  }
  ctcMonths: string[] = [];
  /** `base` is the monthly gross; the CTC also carries an employer EPF line that must not be paid out. */
  async getCtcForMonth(id: string, month: string) {
    this.ctcMonths.push(month);
    const e = this.emps.get(id);
    if (!e || e.ctc === false) return null;
    const gross = (e.base ?? 3_000_000) * 12;
    const lines = [
      { code: 'BASIC', name: 'Basic', kind: 'EARNING' as const, amountPaise: gross, isOverridden: false },
      { code: 'EPF', name: 'EPF (employer)', kind: 'EMPLOYER_CONTRIBUTION' as const, amountPaise: 600_000, isOverridden: false },
    ];
    return { ctcAnnualPaise: gross + 600_000, effectiveFrom: '2026-04', lines };
  }
  async getUnpaidLeaveDays(id: string) {
    return this.emps.get(id)?.unpaid ?? 0;
  }
  /** `date` -> what the day was, for `getMonth`; a test fills it in. The default is October 2026: 31 plain working days. */
  monthDays = new Map<string, Array<{ date: string; status: string }>>();
  async getMonth(id: string, month: string) {
    const days = this.monthDays.get(`${id}:${month}`) ?? Array.from({ length: 31 }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}`, status: 'PRESENT' }));
    return { days, absentDeducts: true, strikeDeducts: false };
  }
  leaveDays = new Map<string, Array<{ date: string; portion: number; paid: boolean; leaveType: string | null; status: 'MANAGER_APPROVED' | 'APPROVED' }>>();
  async listLeaveDays(id: string) {
    return this.leaveDays.get(id) ?? [];
  }
  async countDeductibleDays(id: string) {
    const deductible = this.emps.get(id)?.deductible ?? 0;
    return { absentDays: deductible, strikeDays: 0, deductibleDays: deductible };
  }
}

const closedYears = { value: 'NONE' };
const config = { get: async (key: string) => (key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : key === 'FY_START_MONTH' ? 'APRIL' : key === 'FY_CLOSED_YEARS' ? closedYears.value : '') };
const acct = { id: 'acct', role: 'ACCOUNTANT' };

describe('payroll', () => {
  let runs: FakeRuns;
  let world: World;
  let now: Date;
  let generate: GeneratePayrollUseCase;
  let finalize: FinalizePayrollUseCase;
  const clock = () => new PayrollClock(config, () => now);
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof PayrollRefusal ? e.code : 'OTHER'));

  beforeEach(() => {
    runs = new FakeRuns();
    world = new World();
    now = new Date('2026-11-05T10:00:00+05:30');
    generate = new GeneratePayrollUseCase(runs, world, world, world, clock());
    finalize = new FinalizePayrollUseCase(runs, clock());
    world.add('mr1', { unpaid: 1, esi: '12345678901234567' });
    world.add('mr2');
  });

  it('works out each employee’s sheet: base − one day’s deduction, with no TA/DA or reimbursement in it', async () => {
    const [a, b] = await generate.execute(acct, { month: '2026-10' });
    expect(a).toMatchObject({ userId: 'mr1', outcome: 'created' });
    expect((a as { run: PayrollRun }).run).toMatchObject({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 0, reimbursementPaise: 0, unpaidLeaveDays: 1, leaveDeductionPaise: 100_000, netPayablePaise: 2_900_000, esiNumber: '12345678901234567', status: 'DRAFT', generatedBy: 'acct' });
    expect((b as { run: PayrollRun }).run).toMatchObject({ totalTaDaPaise: 0, leaveDeductionPaise: 0, netPayablePaise: 3_000_000, esiNumber: null }); // no ESI number is normal
  });

  it('an absent day costs a day of pay on top of the leave, shown on its own and frozen with the run', async () => {
    world.emps.get('mr1')!.deductible = 3; // one unpaid leave day and three absent days
    const [a, b] = await generate.execute(acct, { month: '2026-10' });
    expect((a as { run: PayrollRun }).run).toMatchObject({ unpaidLeaveDays: 1, leaveDeductionPaise: 100_000, absentDays: 3, absentDeductionPaise: 300_000, netPayablePaise: 2_600_000 });
    expect((b as { run: PayrollRun }).run).toMatchObject({ absentDays: 0, absentDeductionPaise: 0, netPayablePaise: 3_000_000 });
  });

  it('the unpaid leave and the absent days together never take more than the month', async () => {
    world.emps.get('mr1')!.unpaid = 28;
    world.emps.get('mr1')!.deductible = 9;
    const [a] = await generate.execute(acct, { month: '2026-10' });
    expect((a as { run: PayrollRun }).run).toMatchObject({ leaveDeductionPaise: 2_800_000, absentDays: 2, absentDeductionPaise: 200_000, netPayablePaise: 0 });
  });

  it('only a month that has ended can be generated', async () => {
    expect(await code(generate.execute(acct, { month: '2026-11' }))).toBe(PAYROLL_CODES.monthNotEnded); // the current month
    expect(await code(generate.execute(acct, { month: '2026-12' }))).toBe(PAYROLL_CODES.monthNotEnded);
    now = new Date('2026-11-01T00:00:00+05:30'); // the first moment of the next month, business time
    expect((await generate.execute(acct, { month: '2026-10' })).length).toBe(2);
    now = new Date('2026-10-31T23:59:59+05:30');
    expect(await code(generate.execute(acct, { month: '2026-10' }))).toBe(PAYROLL_CODES.monthNotEnded);
    expect(runs.rows.length).toBe(2);
  });

  it('regenerating a DRAFT recomputes it in place — no second row', async () => {
    await generate.execute(acct, { month: '2026-10' });
    world.emps.get('mr1')!.unpaid = 2;
    const [a] = await generate.execute({ id: 'admin', role: 'ADMIN' }, { month: '2026-10' });
    expect(a).toMatchObject({ outcome: 'updated' });
    expect(runs.rows.length).toBe(2);
    expect(runs.rows[0]).toMatchObject({ leaveDeductionPaise: 200_000, generatedBy: 'admin' });
  });

  it('finalizes once; the sheet is then frozen against everything that changes behind it', async () => {
    await generate.execute(acct, { month: '2026-10' });
    const done = await finalize.execute('p1', 'acct');
    expect(done).toMatchObject({ status: 'FINALIZED' });
    expect(done.finalizedAt).toEqual(now);
    // CTC raised, the ESI number changed, more leave approved: the finalized numbers do not move.
    world.emps.get('mr1')!.base = 9_999_900;
    world.emps.get('mr1')!.esi = '99999999999999999';
    world.emps.get('mr1')!.unpaid = 9;
    expect(await code(generate.execute(acct, { month: '2026-10', userIds: ['mr1'] }))).toBe(PAYROLL_CODES.alreadyFinalized);
    expect(runs.rows[0]).toMatchObject({ baseSalaryPaise: 3_000_000, netPayablePaise: 2_900_000, esiNumber: '12345678901234567', status: 'FINALIZED' });
    expect(await code(finalize.execute('p1', 'acct'))).toBe(PAYROLL_CODES.alreadyFinalized);
    expect(await code(finalize.execute('nope', 'acct'))).toBe(PAYROLL_CODES.runNotFound);
  });

  it('in a batch, a finalized employee is that employee’s line, not a failure of the rest', async () => {
    await generate.execute(acct, { month: '2026-10' });
    await finalize.execute('p1', 'acct');
    const out = await generate.execute(acct, { month: '2026-10' });
    expect(out.map((o) => [o.userId, o.outcome, 'reason' in o ? o.reason : ''])).toEqual([['mr1', 'skipped', PAYROLL_CODES.alreadyFinalized], ['mr2', 'updated', '']]);
  });

  it('pays the monthly gross of the CTC in force for the month — not the employer’s EPF — and snapshots the breakdown', async () => {
    const [a] = await generate.execute(acct, { month: '2026-10', userIds: ['mr1'] });
    const run = (a as { run: PayrollRun }).run;
    expect(world.ctcMonths).toEqual(['2026-10']);
    expect(run).toMatchObject({ baseSalaryPaise: 3_000_000, ctcAnnualPaise: 36_600_000, ctcEffectiveFrom: '2026-04' });
    expect(run.ctcLines.map((l) => l.code)).toEqual(['BASIC', 'EPF']);
  });

  it('an employee with no CTC is skipped with a reason; the others are still done', async () => {
    world.add('mr3', { ctc: false });
    const out = await generate.execute(acct, { month: '2026-10' });
    expect(out.map((o) => [o.userId, o.outcome])).toEqual([['mr1', 'created'], ['mr2', 'created'], ['mr3', 'skipped']]);
    expect(out[2]).toMatchObject({ reason: PAYROLL_CODES.noCtc });
    expect(runs.rows.length).toBe(2);
  });

  it('a bulk run covers active field employees only; a named non-field or inactive one is refused, not paid', async () => {
    world.add('hr1', { role: 'HR' });
    world.add('gone', { status: 'inactive' });
    expect((await generate.execute(acct, { month: '2026-10' })).map((o) => o.userId)).toEqual(['mr1', 'mr2']);
    const named = await generate.execute(acct, { month: '2026-10', userIds: ['hr1', 'gone', 'nobody', 'mr1', 'mr1'] });
    expect(named.map((o) => [o.userId, o.outcome, 'reason' in o ? o.reason : ''])).toEqual([
      ['hr1', 'skipped', PAYROLL_CODES.notFieldEmployee],
      ['gone', 'skipped', PAYROLL_CODES.notFieldEmployee],
      ['nobody', 'skipped', PAYROLL_CODES.userNotFound],
      ['mr1', 'updated', ''],
    ]);
  });

  it('flags — and does not prorate — someone who joined during the month', async () => {
    world.add('new', { joined: new Date('2026-10-16T00:00:00Z') });
    world.add('old', { joined: new Date('2026-09-30T00:00:00Z') });
    const out = await generate.execute(acct, { month: '2026-10', userIds: ['new', 'old'] });
    expect(out.map((o) => (o as { run: PayrollRun }).run.joinedInMonth)).toEqual([true, false]);
    expect((out[0] as { run: PayrollRun }).run.baseSalaryPaise).toBe(3_000_000);
  });

  it('one employee’s fault is reported for them and never fails the batch', async () => {
    world.emps.get('mr1')!.unpaid = 0.3; // not a whole or half day: a fault upstream
    const out = await generate.execute(acct, { month: '2026-10' });
    expect(out[0]).toMatchObject({ userId: 'mr1', outcome: 'skipped', reason: PAYROLL_CODES.error });
    expect(out[1]).toMatchObject({ userId: 'mr2', outcome: 'created' });
  });

  it('reads one run and lists by month, employee and status', async () => {
    await generate.execute(acct, { month: '2026-10' });
    await finalize.execute('p2', 'acct');
    const list = new ListPayrollRunsUseCase(runs);
    expect((await list.execute({})).length).toBe(2);
    expect((await list.execute({ status: 'FINALIZED' })).map((r) => r.userId)).toEqual(['mr2']);
    expect((await list.execute({ userId: 'mr1', month: '2026-10' })).length).toBe(1);
    expect((await list.execute({ month: '2026-09' })).length).toBe(0);
    expect((await list.execute({ fromMonth: '2026-04', toMonth: '2027-03' })).length).toBe(2); // a range, both ends in
    expect((await list.execute({ fromMonth: '2026-11' })).length).toBe(0);
    expect((await list.execute({ toMonth: '2026-09' })).length).toBe(0);
    expect((await new GetPayrollRunUseCase(runs).execute('p1')).userId).toBe('mr1');
    expect(await code(new GetPayrollRunUseCase(runs).execute('zzz'))).toBe(PAYROLL_CODES.runNotFound);
  });

  it('a month inside a closed financial year can be neither generated nor finalized, and reopening lets it through', async () => {
    await generate.execute(acct, { month: '2026-10' });
    closedYears.value = '2026';
    const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as { statusCode?: number; message?: string });
    expect(await refusal(generate.execute(acct, { month: '2026-10' }))).toMatchObject({ statusCode: 409 });
    expect(await refusal(finalize.execute('p1', 'acct'))).toMatchObject({ statusCode: 409 });
    expect(runs.rows[0]!.status).toBe('DRAFT');
    // A month of another year is not affected: 2026-03 belongs to 2025-26.
    expect(await refusal(generate.execute(acct, { month: '2026-03' }))).toBeNull();
    closedYears.value = 'NONE';
    expect(await refusal(finalize.execute('p1', 'acct'))).toBeNull();
  });

  it('says whether an employee’s month is finalized, for HR’s leave lock: a draft is not', async () => {
    await generate.execute(acct, { month: '2026-10' });
    expect(await runs.isFinalized('mr1', '2026-10')).toBe(false);
    await finalize.execute('p1', 'acct');
    expect(await runs.isFinalized('mr1', '2026-10')).toBe(true);
    expect(await runs.isFinalized('mr2', '2026-10')).toBe(false);
    expect(await runs.isFinalized('mr1', '2026-09')).toBe(false);
  });

  describe('HR adjusts a draft, the Accountant finalizes and pays (decision-log 2026-10-13)', () => {
    const hr = { id: 'hr1', role: 'HR' };
    const admin = { id: 'admin', role: 'ADMIN' };
    let adjust: AdjustPayrollUseCase;
    let pay: PayPayrollUseCase;
    let overview: PayrollOverviewUseCase;
    let n = 0;
    const draftOf = async (userId = 'mr1') => {
      const out = await generate.execute(acct, { month: '2026-10', userIds: [userId] });
      return (out[0] as { run: PayrollRun }).run;
    };

    beforeEach(() => {
      n = 0;
      adjust = new AdjustPayrollUseCase(runs, clock(), () => `adj-${++n}`);
      pay = new PayPayrollUseCase(runs, clock());
      overview = new PayrollOverviewUseCase(runs, world, clock());
      // mr1: one unpaid leave day (the 6th) and one absent day (the 5th).
      world.emps.get('mr1')!.deductible = 1;
      world.monthDays.set('mr1:2026-10', Array.from({ length: 31 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, status: i === 4 ? 'ABSENT' : i === 5 ? 'LEAVE' : i === 3 ? 'HOLIDAY' : 'PRESENT' })));
      world.leaveDays.set('mr1', [{ date: '2026-10-06', portion: 1, paid: false, leaveType: 'Loss of Pay', status: 'APPROVED' }]);
    });

    it('freezes each day with what the rules charge for it: an absent day 1, an unpaid leave day its portion', async () => {
      const run = await draftOf();
      expect(run.days).toHaveLength(31);
      expect(run.days.find((d) => d.date === '2026-10-05')).toMatchObject({ status: 'ABSENT', deductedDays: 1 });
      expect(run.days.find((d) => d.date === '2026-10-06')).toMatchObject({ status: 'LEAVE', deductedDays: 1, leaveType: 'Loss of Pay' });
      expect(run.days.find((d) => d.date === '2026-10-07')).toMatchObject({ status: 'PRESENT', deductedDays: 0 });
      expect(run).toMatchObject({ adjustments: [], adjustmentPaise: 0, originalNetPayablePaise: run.netPayablePaise });
    });

    it('not charging an absent day adds a day of pay; the net moves, the original stays, and who and why are kept', async () => {
      const run = await draftOf();
      const before = run.netPayablePaise; // 3,000,000 − 1 leave day − 1 absent day
      const changed = await adjust.overrideDay(hr, run.id, { date: '2026-10-05', setDays: 0, reason: 'Was on duty, report missed' });
      expect(changed).toMatchObject({ adjustmentPaise: 100_000, netPayablePaise: before + 100_000, originalNetPayablePaise: before });
      expect(changed.adjustments[0]).toMatchObject({ kind: 'DAY', date: '2026-10-05', ruleDays: 1, setDays: 0, amountPaise: 100_000, reason: 'Was on duty, report missed', by: 'hr1', byRole: 'HR' });
    });

    it('charging a worked day, or half a day, takes pay off; the latest change to a date is the one that counts', async () => {
      const run = await draftOf();
      await adjust.overrideDay(hr, run.id, { date: '2026-10-07', setDays: 1, reason: 'Left early' });
      expect((await runs.findById(run.id))!.adjustmentPaise).toBe(-100_000);
      const second = await adjust.overrideDay(admin, run.id, { date: '2026-10-07', setDays: 0.5, reason: 'Only half' });
      expect(second.adjustmentPaise).toBe(-50_000); // the earlier change to the 7th counts for nothing now
      expect(second.adjustments).toHaveLength(2); // but stays on record
    });

    it('adds or takes off an amount, never zero, never below zero net', async () => {
      const run = await draftOf('mr2');
      expect((await adjust.addAmount(hr, run.id, { amountPaise: 50_000, reason: 'Bonus' })).netPayablePaise).toBe(3_050_000);
      expect((await adjust.addAmount(hr, run.id, { amountPaise: -20_000, reason: 'Advance recovered' })).netPayablePaise).toBe(3_030_000);
      expect(await code(adjust.addAmount(hr, run.id, { amountPaise: 0, reason: 'x' }))).toBe(PAYROLL_CODES.badDay);
      expect(await code(adjust.addAmount(hr, run.id, { amountPaise: -9_000_000, reason: 'x' }))).toBe(PAYROLL_CODES.negativeNet);
      expect((await runs.findById(run.id))!.adjustments).toHaveLength(2); // the refused ones left nothing
    });

    it('only HR and Admin change a draft, only chargeable days, only 0, a half or a whole', async () => {
      const run = await draftOf();
      await expect(adjust.overrideDay(acct, run.id, { date: '2026-10-05', setDays: 0, reason: 'x' })).rejects.toMatchObject({ statusCode: 403 });
      expect(await code(adjust.overrideDay(hr, run.id, { date: '2026-10-04', setDays: 1, reason: 'x' }))).toBe(PAYROLL_CODES.badDay); // a holiday
      expect(await code(adjust.overrideDay(hr, run.id, { date: '2026-11-04', setDays: 1, reason: 'x' }))).toBe(PAYROLL_CODES.badDay); // not this month
      expect(await code(adjust.overrideDay(hr, run.id, { date: '2026-10-05', setDays: 0.3, reason: 'x' }))).toBe(PAYROLL_CODES.badDay);
      expect(await code(adjust.overrideDay(hr, 'nope', { date: '2026-10-05', setDays: 0, reason: 'x' }))).toBe(PAYROLL_CODES.runNotFound);
    });

    it('regenerating the draft keeps the adjustments and re-applies them to the new figures', async () => {
      const run = await draftOf();
      await adjust.overrideDay(hr, run.id, { date: '2026-10-05', setDays: 0, reason: 'Was on duty' });
      await adjust.addAmount(hr, run.id, { amountPaise: 10_000, reason: 'Bonus' });
      world.emps.get('mr1')!.base = 6_000_000; // a CTC revision: a day is worth more now
      const again = await draftOf();
      expect(again.adjustments).toHaveLength(2);
      expect(again.adjustmentPaise).toBe(200_000 + 10_000); // the day is worth 200,000 now
      expect(again.netPayablePaise).toBe(again.originalNetPayablePaise + 210_000);
    });

    it('is locked once finalized: no more changes, and only a finalized run can be marked paid, once, by the Accountant', async () => {
      const run = await draftOf();
      await expect(pay.execute(acct, run.id, {})).rejects.toMatchObject({ code: PAYROLL_CODES.notFinalized });
      await finalize.execute(run.id, 'acct');
      expect(runs.rows[0]).toMatchObject({ status: 'FINALIZED', finalizedBy: 'acct' });
      expect(await code(adjust.addAmount(hr, run.id, { amountPaise: 1, reason: 'x' }))).toBe(PAYROLL_CODES.notDraft);
      expect(await code(adjust.overrideDay(hr, run.id, { date: '2026-10-05', setDays: 0, reason: 'x' }))).toBe(PAYROLL_CODES.notDraft);
      await expect(pay.execute(hr, run.id, {})).rejects.toMatchObject({ statusCode: 403 });
      const paid = await pay.execute(acct, run.id, { reference: ' UTR 123 ' });
      expect(paid).toMatchObject({ paidBy: 'acct', paymentReference: 'UTR 123' });
      expect(paid.paidAt).not.toBeNull();
      expect(await code(pay.execute(acct, run.id, {}))).toBe(PAYROLL_CODES.alreadyPaid);
    });

    it('the month table lists every active field employee with where each stands', async () => {
      const run = await draftOf();
      await adjust.addAmount(hr, run.id, { amountPaise: 10_000, reason: 'Bonus' });
      let sheet = await overview.execute(hr, '2026-10');
      expect(sheet).toMatchObject({ month: '2026-10', generateFrom: '2026-11-01', canGenerate: true });
      const row = (id: string) => sheet.rows.find((r) => r.userId === id)!;
      expect(row('mr1')).toMatchObject({ stage: 'DRAFT', baseSalaryPaise: 3_000_000, absentDays: 1, unpaidLeaveDays: 1, deductionPaise: 200_000, adjustmentPaise: 10_000, netPayablePaise: 2_810_000 });
      expect(row('mr2')).toMatchObject({ stage: 'NOT_GENERATED', runId: null, netPayablePaise: null });
      await finalize.execute(run.id, 'acct');
      sheet = await overview.execute(acct, '2026-10');
      expect(row('mr1').stage).toBe('FINALIZED');
      await pay.execute(acct, run.id, {});
      sheet = await overview.execute(admin, '2026-10');
      expect(row('mr1').stage).toBe('PAID');
      await expect(overview.execute({ id: 'mr1', role: 'FIELD' }, '2026-10')).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
