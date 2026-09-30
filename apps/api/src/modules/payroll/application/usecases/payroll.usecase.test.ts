import { beforeEach, describe, expect, it } from 'vitest';
import type { PayrollFilter, PayrollRunRepositoryPort, SaveDraftResult } from '../../domain/payroll.repository.port.js';
import { PAYROLL_CODES, PayrollRefusal } from '../../domain/payrollRefusal.js';
import type { PayrollDraft, PayrollRun } from '../../domain/payrollRun.entity.js';
import type { FieldActivityPort, HrPort, IdentityPort } from '../../domain/ports.js';
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

type Emp = { role?: string; status?: 'active' | 'inactive'; payBandId?: string | null; base?: number; joined?: Date | null; unpaid?: number; paid?: { taPaise: number; daPaise: number; reimbursementPaise: number } };
class World implements IdentityPort, HrPort, FieldActivityPort {
  emps = new Map<string, Emp>();
  add(id: string, e: Emp = {}) {
    this.emps.set(id, e);
  }
  async listActiveFieldUserIds() {
    return [...this.emps].filter(([, e]) => (e.role ?? 'FIELD') === 'FIELD' && (e.status ?? 'active') === 'active').map(([id]) => id);
  }
  async findUserSummary(id: string) {
    const e = this.emps.get(id);
    return e ? { id, name: id, role: e.role ?? 'FIELD', status: e.status ?? 'active' } : null;
  }
  async getEmploymentDetails(id: string) {
    const e = this.emps.get(id);
    return e ? { payBandId: e.payBandId === undefined ? 'band' : e.payBandId, dateOfJoining: e.joined ?? new Date('2024-01-01') } : null;
  }
  async getPayBandRates(id: string) {
    return { baseSalaryPaise: this.emps.get(id)?.base ?? 3_000_000 };
  }
  async getUnpaidLeaveDays(id: string) {
    return this.emps.get(id)?.unpaid ?? 0;
  }
  async getPaidTaDaTotal(id: string) {
    return this.emps.get(id)?.paid ?? { taPaise: 0, daPaise: 0, reimbursementPaise: 0 };
  }
}

const config = { get: async (key: string) => (key === 'BUSINESS_TIMEZONE' ? 'Asia/Kolkata' : '') };
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
    world.add('mr1', { paid: { taPaise: 8003, daPaise: 20000, reimbursementPaise: 5000 }, unpaid: 1 });
    world.add('mr2');
  });

  it('works out each employee’s sheet: base + TA/DA + reimbursement − one day’s deduction', async () => {
    const [a, b] = await generate.execute(acct, { month: '2026-10' });
    expect(a).toMatchObject({ userId: 'mr1', outcome: 'created' });
    expect((a as { run: PayrollRun }).run).toMatchObject({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 28003, reimbursementPaise: 5000, unpaidLeaveDays: 1, leaveDeductionPaise: 100_000, netPayablePaise: 2_933_003, status: 'DRAFT', generatedBy: 'acct' });
    expect((b as { run: PayrollRun }).run).toMatchObject({ totalTaDaPaise: 0, leaveDeductionPaise: 0, netPayablePaise: 3_000_000 }); // no activity is normal
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
    // Pay band raised, more expenses paid, more leave approved: the finalized numbers do not move.
    world.emps.get('mr1')!.base = 9_999_900;
    world.emps.get('mr1')!.paid = { taPaise: 1, daPaise: 1, reimbursementPaise: 1 };
    world.emps.get('mr1')!.unpaid = 9;
    expect(await code(generate.execute(acct, { month: '2026-10', userIds: ['mr1'] }))).toBe(PAYROLL_CODES.alreadyFinalized);
    expect(runs.rows[0]).toMatchObject({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 28003, netPayablePaise: 2_933_003, status: 'FINALIZED' });
    expect(await code(finalize.execute('p1'))).toBe(PAYROLL_CODES.alreadyFinalized);
    expect(await code(finalize.execute('nope'))).toBe(PAYROLL_CODES.runNotFound);
  });

  it('in a batch, a finalized employee is that employee’s line, not a failure of the rest', async () => {
    await generate.execute(acct, { month: '2026-10' });
    await finalize.execute('p1');
    const out = await generate.execute(acct, { month: '2026-10' });
    expect(out.map((o) => [o.userId, o.outcome, 'reason' in o ? o.reason : ''])).toEqual([['mr1', 'skipped', PAYROLL_CODES.alreadyFinalized], ['mr2', 'updated', '']]);
  });

  it('an employee with no Pay Band is skipped with a reason; the others are still done', async () => {
    world.add('mr3', { payBandId: null });
    const out = await generate.execute(acct, { month: '2026-10' });
    expect(out.map((o) => [o.userId, o.outcome])).toEqual([['mr1', 'created'], ['mr2', 'created'], ['mr3', 'skipped']]);
    expect(out[2]).toMatchObject({ reason: PAYROLL_CODES.noPayBand });
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
});
