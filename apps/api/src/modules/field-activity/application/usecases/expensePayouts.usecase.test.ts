import { beforeEach, describe, expect, it } from 'vitest';
import { DcrClock } from '../dcrClock.js';
import { ListExpensePayoutsUseCase, PayMonthExpensesUseCase } from './expensePayouts.usecase.js';
import { faKit, Tx } from './faTestKit.js';

const DAY = '2026-10-05';
const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };

describe('the expense payout (decision-log 2026-10-06)', () => {
  let kit: ReturnType<typeof faKit>;
  let list: ListExpensePayoutsUseCase;
  let pay: PayMonthExpensesUseCase;
  let at = new Date('2026-11-15T06:00:00Z');

  beforeEach(async () => {
    kit = faKit();
    at = new Date('2026-11-15T06:00:00Z');
    kit.planning.approve('mr1', DAY);
    kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-1'] });
    await kit.logExpense.execute(REC, { reportDate: DAY, type: 'MEAL', amountPaise: 5000, remarks: null }, new Tx());
    const { dcrId } = await kit.submit.execute('mr1', DAY, REC.recordedAt, new Tx());
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    kit.users.rates.exStationDaPaise = 20000;
    const clock = new DcrClock(kit.config, () => at);
    list = new ListExpensePayoutsUseCase(kit.expenses, kit.users, kit.config, clock);
    pay = new PayMonthExpensesUseCase(kit.expenses, () => at);
  });

  it('is one statement per employee for the month the expenses were incurred, TA, DA and reimbursements apart', async () => {
    const sheet = await list.execute('2026-10');
    expect(sheet.dueDate).toBe('2026-11-15');
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]).toMatchObject({ userId: 'mr1', userName: 'mr1', unpaid: { taPaise: 8003, daPaise: 0, reimbursementPaise: 5000, count: 2 }, paid: { count: 0 }, lastPaidAt: null });
    expect((await list.execute('2026-09')).rows).toEqual([]);
    expect((await list.execute('2026-11')).rows).toEqual([]);
  });

  it('is overdue only when something is unpaid and the day has passed — a flag, not a block', async () => {
    at = new Date('2026-11-15T10:00:00+05:30');
    expect((await list.execute('2026-10')).overdue).toBe(false);
    at = new Date('2026-11-16T10:00:00+05:30');
    expect((await list.execute('2026-10')).overdue).toBe(true);
    await pay.execute('acct', { month: '2026-10' });
    expect((await list.execute('2026-10')).overdue).toBe(false);
  });

  it('pays everything unpaid for everyone owed, with who and when, and shows it paid', async () => {
    const out = await pay.execute('acct', { month: '2026-10' });
    expect(out).toEqual([{ userId: 'mr1', paidCount: 2, paidPaise: 13003 }]);
    expect(kit.expenses.rows.map((r) => [r.paymentStatus, r.paidBy, r.paidAt])).toEqual(kit.expenses.rows.map(() => ['PAID', 'acct', at]));
    const row = (await list.execute('2026-10')).rows[0]!;
    expect(row).toMatchObject({ unpaid: { count: 0, taPaise: 0 }, paid: { taPaise: 8003, reimbursementPaise: 5000, count: 2 }, lastPaidAt: at });
  });

  it('a second press pays nothing and moves no date', async () => {
    await pay.execute('acct', { month: '2026-10' });
    const firstPaidAt = kit.expenses.rows[0]!.paidAt;
    at = new Date('2026-11-20T06:00:00Z');
    expect(await pay.execute('acct', { month: '2026-10' })).toEqual([]);
    expect(await pay.execute('acct', { month: '2026-10', userIds: ['mr1'] })).toEqual([{ userId: 'mr1', paidCount: 0, paidPaise: 0 }]);
    expect(kit.expenses.rows[0]!.paidAt).toEqual(firstPaidAt);
  });

  it('pays only the month asked for, and only claims that were accepted and not cancelled', async () => {
    const other = { ...kit.expenses.rows[0]!, id: 'other-month', reportDate: '2026-11-03' };
    const cancelled = { ...kit.expenses.rows[0]!, id: 'cancelled', paymentStatus: 'CANCELLED' as const };
    const notAccepted = { ...kit.expenses.rows[0]!, id: 'not-accepted', accepted: false };
    kit.expenses.rows.push(other, cancelled, notAccepted);
    await pay.execute('acct', { month: '2026-10' });
    expect(kit.expenses.rows.find((r) => r.id === 'other-month')!.paymentStatus).toBe('UNPAID');
    expect(kit.expenses.rows.find((r) => r.id === 'cancelled')!.paymentStatus).toBe('CANCELLED');
    expect(kit.expenses.rows.find((r) => r.id === 'not-accepted')!.paymentStatus).toBe('UNPAID');
  });

  it('an unknown month is refused', async () => {
    await expect(list.execute('2026-13')).rejects.toBeDefined();
    await expect(pay.execute('acct', { month: 'October' })).rejects.toBeDefined();
  });
});
