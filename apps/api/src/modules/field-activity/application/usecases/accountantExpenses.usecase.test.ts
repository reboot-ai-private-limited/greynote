import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { faKit, Tx } from './faTestKit.js';

const DAY = '2026-10-05';
const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };

async function status(p: Promise<unknown>) {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).statusCode;
}

describe('the Accountant’s side', () => {
  let kit: ReturnType<typeof faKit>;
  let dcrId: string;
  const approve = () => kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());

  beforeEach(async () => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-1'] });
    await kit.logExpense.execute(REC, { reportDate: DAY, type: 'MEAL', amountPaise: 5000, remarks: null }, new Tx());
    dcrId = (await kit.submit.execute('mr1', DAY, REC.recordedAt, new Tx())).dcrId;
  });

  it('before the manager accepts, nothing is auditable or payable — not even the MR’s own claim', async () => {
    expect(await kit.listExpenses.execute({ from: DAY, to: DAY })).toEqual([]);
    expect(await status(kit.markPaid.execute('acct', kit.expenses.rows[0]!.id))).toBe(409);
  });

  it('once accepted, the manual claim and the computed TA are listed, unpaid first, with the employee’s name', async () => {
    await approve();
    const rows = await kit.listExpenses.execute({ from: DAY, to: DAY });
    expect(rows.map((r) => [r.source, r.type, r.paymentStatus, r.userName])).toEqual([['MANUAL', 'MEAL', 'UNPAID', 'mr1'], ['AUTO', 'TA', 'UNPAID', 'mr1']]);
    kit.expenses.rows[0]!.paymentStatus = 'PAID';
    expect((await kit.listExpenses.execute({ from: DAY, to: DAY })).map((r) => r.paymentStatus)).toEqual(['UNPAID', 'PAID']);
    expect((await kit.listExpenses.execute({ from: DAY, to: DAY, paymentStatus: 'PAID' })).length).toBe(1);
    expect((await kit.listExpenses.execute({ from: '2026-11-01', to: '2026-11-30' })).length).toBe(0);
    expect((await kit.listExpenses.execute({ from: DAY, to: DAY, userId: 'mr2' })).length).toBe(0);
  });

  it('mark-paid records who and when, and marking again changes nothing', async () => {
    await approve();
    const id = kit.expenses.rows[1]!.id;
    const first = await kit.markPaid.execute('acct', id);
    expect(first).toMatchObject({ paymentStatus: 'PAID', paidBy: 'acct', paidAt: new Date(kit.clock.current) });
    kit.clock.current = new Date('2026-10-20T00:00:00Z');
    expect(await kit.markPaid.execute('other-acct', id)).toMatchObject({ paidBy: 'acct', paidAt: first.paidAt });
  });

  it('a row sent back is not payable: the cancelled computed row and the un-accepted manual row are 409; an unknown id is 404', async () => {
    await approve();
    await kit.taDa.onStatusChange(dcrId, 'REJECTED', new Tx());
    expect(await status(kit.markPaid.execute('acct', kit.expenses.rows[1]!.id))).toBe(409); // CANCELLED
    expect(await status(kit.markPaid.execute('acct', kit.expenses.rows[0]!.id))).toBe(409); // MANUAL, no longer accepted
    expect(await kit.listExpenses.execute({ from: DAY, to: DAY })).toEqual([]);
    expect(await status(kit.markPaid.execute('acct', 'nope'))).toBe(404);
  });

  it('a PAID row survives the DCR being sent back, and stays accepted', async () => {
    await approve();
    await kit.markPaid.execute('acct', kit.expenses.rows[1]!.id);
    await kit.taDa.onStatusChange(dcrId, 'REOPENED', new Tx());
    expect(kit.expenses.rows[1]).toMatchObject({ paymentStatus: 'PAID', accepted: true });
    expect(kit.expenses.rows[0]!.accepted).toBe(false);
  });

  it('a resubmitted and re-approved DCR makes its manual claim payable again', async () => {
    await approve();
    await kit.taDa.onStatusChange(dcrId, 'REJECTED', new Tx());
    await approve();
    expect(kit.expenses.rows[0]!.accepted).toBe(true);
    expect((await kit.markPaid.execute('acct', kit.expenses.rows[0]!.id)).paymentStatus).toBe('PAID');
  });

  it('Payroll’s total counts only PAID rows of that month for that user: TA, DA and the reimbursements apart', async () => {
    kit.territory.routes.set('route-1', { ...kit.territory.routes.get('route-1')!, areaType: 'EX_STATION' });
    await approve(); // TA 8003 + DA 20000, MEAL 5000
    expect(await kit.paidTaDa.execute('mr1', '2026-10')).toEqual({ taPaise: 0, daPaise: 0, reimbursementPaise: 0 });
    for (const r of kit.expenses.rows) await kit.markPaid.execute('acct', r.id);
    expect(await kit.paidTaDa.execute('mr1', '2026-10')).toEqual({ taPaise: 8003, daPaise: 20000, reimbursementPaise: 5000 }); // the meal is its own figure
    expect(await kit.paidTaDa.execute('mr1', '2026-09')).toEqual({ taPaise: 0, daPaise: 0, reimbursementPaise: 0 });
    expect(await kit.paidTaDa.execute('mr2', '2026-10')).toEqual({ taPaise: 0, daPaise: 0, reimbursementPaise: 0 });
  });

  it('the DCR summary: status, counts and money per day, cancelled rows left out', async () => {
    await approve();
    await kit.markPaid.execute('acct', kit.expenses.rows[0]!.id);
    const [s] = await kit.dcrSummary.execute('mr1', { from: '2026-10-01', to: '2026-10-31' });
    expect(s).toMatchObject({ dcrId, reportDate: DAY, status: 'SUBMITTED', doctorCalls: 0, taPaise: 8003, daPaise: 0, otherExpensesPaise: 5000, paidPaise: 5000 });
    await kit.taDa.onStatusChange(dcrId, 'REJECTED', new Tx());
    expect((await kit.dcrSummary.execute('mr1', { from: DAY, to: DAY }))[0]).toMatchObject({ taPaise: 0 });
    expect(await kit.dcrSummary.execute('mr1', { from: '2026-11-01', to: '2026-11-30' })).toEqual([]);
  });
});
