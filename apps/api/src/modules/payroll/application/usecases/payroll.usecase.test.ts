import { beforeEach, describe, expect, it } from 'vitest';
import type { PayrollFilter, PayrollRunRepositoryPort, SaveDraftResult } from '../../domain/payroll.repository.port.js';
import { PAYROLL_CODES, PayrollRefusal } from '../../domain/payrollRefusal.js';
import type { PayrollDraft, PayrollRun } from '../../domain/payrollRun.entity.js';
import type { HrPort, IdentityPort } from '../../domain/ports.js';
import { FinalizePayrollUseCase, GeneratePayrollUseCase, GetPayrollRunUseCase, ListPayrollRunsUseCase, PayrollClock } from './payroll.usecase.js';

class FakeRuns implements PayrollRunRepositoryPort {
  rows: PayrollRun[] = [];
  async saveDraft(d: PayrollDraft): Promise<SaveDraftResult> {
    const old = this.rows.find((r) => r.userId === d.userId && r.month === d.month);
    if (old?.status === 'FINALIZED') return { outcome: 'finalized' };
    if (old) return { outcome: 'updated', run: Object.assign(old, d) };
    const run: PayrollRun = { ...d, id: `p${this.rows.length + 1}`, status: 'DRAFT', finalizedAt: null };
    this.rows.push(run);
    return { outcome: 'created', run };
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list(f: PayrollFilter) {
    return this.rows.filter((r) => (!f.month || r.month === f.month) && (!f.fromMonth || r.month >= f.fromMonth) && (!f.toMonth || r.month <= f.toMonth) && (!f.userId || r.userId === f.userId) && (!f.status || r.status === f.status));
  }
  async finalize(id: string, at: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'DRAFT') return false;
    Object.assign(r, { status: 'FINALIZED', finalizedAt: at });
    return true;
  }
}

type Emp = { role?: string; status?: 'active' | 'inactive'; ctc?: boolean; base?: number; joined?: Date | null; unpaid?: number; esi?: string | null };
class World implements IdentityPort, HrPort {
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
    generate = new GeneratePayrollUseCase(runs, world, world, clock());
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
    const done = await finalize.execute('p1');
    expect(done).toMatchObject({ status: 'FINALIZED' });
    expect(done.finalizedAt).toEqual(now);
    // CTC raised, the ESI number changed, more leave approved: the finalized numbers do not move.
    world.emps.get('mr1')!.base = 9_999_900;
    world.emps.get('mr1')!.esi = '99999999999999999';
    world.emps.get('mr1')!.unpaid = 9;
    expect(await code(generate.execute(acct, { month: '2026-10', userIds: ['mr1'] }))).toBe(PAYROLL_CODES.alreadyFinalized);
    expect(runs.rows[0]).toMatchObject({ baseSalaryPaise: 3_000_000, netPayablePaise: 2_900_000, esiNumber: '12345678901234567', status: 'FINALIZED' });
    expect(await code(finalize.execute('p1'))).toBe(PAYROLL_CODES.alreadyFinalized);
    expect(await code(finalize.execute('nope'))).toBe(PAYROLL_CODES.runNotFound);
  });

  it('in a batch, a finalized employee is that employee’s line, not a failure of the rest', async () => {
    await generate.execute(acct, { month: '2026-10' });
    await finalize.execute('p1');
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
    await finalize.execute('p2');
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
    expect(await refusal(finalize.execute('p1'))).toMatchObject({ statusCode: 409 });
    expect(runs.rows[0]!.status).toBe('DRAFT');
    // A month of another year is not affected: 2026-03 belongs to 2025-26.
    expect(await refusal(generate.execute(acct, { month: '2026-03' }))).toBeNull();
    closedYears.value = 'NONE';
    expect(await refusal(finalize.execute('p1'))).toBeNull();
  });
});
