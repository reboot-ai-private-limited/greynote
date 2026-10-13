import { beforeEach, describe, expect, it } from 'vitest';
import { DcrClock } from '../dcrClock.js';
import { ExpenseMonthDeadlines } from '../expenseMonthDeadlines.js';
import type { ExpenseMonthGrantRepositoryPort } from '../../domain/expenseMonthGrant.repository.port.js';
import type { ExpenseMonthRecord, ExpenseMonthRepositoryPort } from '../../domain/records.repository.port.js';
import { ExpenseMonthService } from './expenseMonth.usecase.js';
import { eachDay, ExpenseOverviewUseCase, ExpenseReviewService } from './expenseReview.usecase.js';
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
    const row: ExpenseMonthRecord = { id: `em-${this.rows.length + 1}`, userId, month, status: 'SUBMITTED', submittedAt: at, ...totals };
    this.rows.push(row);
    return row;
  }
  async listForUsers(userIds: string[], month: string) {
    return this.rows.filter((r) => userIds.includes(r.userId) && r.month === month);
  }
}
const noGrants = { findUsable: async () => null } as unknown as ExpenseMonthGrantRepositoryPort;

const HR = { id: 'hr1', role: 'HR' as const };
const ACCOUNTANT = { id: 'acc1', role: 'ACCOUNTANT' as const };
const MR = { id: 'mr1', role: 'FIELD' as const };

describe('the expense review (decision-log 2026-10-13)', () => {
  let kit: ReturnType<typeof faKit>;
  let months: FakeMonths;
  let svc: ExpenseMonthService;
  let review: ExpenseReviewService;
  let overview: ExpenseOverviewUseCase;

  beforeEach(() => {
    kit = faKit(); // 2026-10-05: September is over
    months = new FakeMonths();
    const clock = new DcrClock(kit.config, () => kit.clock.current);
    svc = new ExpenseMonthService(kit.expenses, months, kit.users, kit.approvals, clock, kit.config, { run: (fn) => fn(new Tx()) }, { upload: async () => ({ url: '', publicId: '' }), remove: async () => undefined }, noGrants, new ExpenseMonthDeadlines(kit.config, () => kit.clock.current));
    review = new ExpenseReviewService(svc, kit.expenses, kit.dcrs, kit.approvals, kit.planning, kit.territory, kit.leave, kit.users, clock);
    overview = new ExpenseOverviewUseCase(kit.expenses, months, kit.approvals, kit.users, kit.config);
  });

  const claim = (date: string, type: 'TA' | 'DA' | 'OTHER', amountPaise: number, routeId: string | null = null, accepted = true) =>
    kit.expenses.create({ dcrId: type === 'OTHER' ? null : `dcr-${date}`, userId: 'mr1', reportDate: date, routeId, type, source: type === 'OTHER' ? 'MANUAL' : 'AUTO', amountPaise, remarks: null, paymentStatus: 'UNPAID', accepted, monthApproved: false, distanceFlag: false, paidBy: null, paidAt: null, clientId: null, recordedAt: new Date() }, new Tx());

  it('lists every day of a past month with what it was: working, off, holiday, paid or unpaid leave', async () => {
    kit.leave.offDays.add('2026-09-13');
    kit.leave.holidays.add('2026-09-14');
    kit.leave.leavePay.set('2026-09-11', false);
    kit.leave.leavePay.set('2026-09-12', true);
    const r = await review.review(HR, 'mr1', '2026-09');
    expect(r.days).toHaveLength(30);
    const by = (d: string) => r.days.find((x) => x.date === d)!;
    expect(by('2026-09-10')).toMatchObject({ dayType: 'WORKING', leave: null });
    expect(by('2026-09-11')).toMatchObject({ dayType: 'LEAVE', leave: { paid: false, portion: 1 } });
    expect(by('2026-09-12')).toMatchObject({ dayType: 'LEAVE', leave: { paid: true } });
    expect(by('2026-09-13').dayType).toBe('WEEKLY_OFF');
    expect(by('2026-09-14').dayType).toBe('HOLIDAY');
    expect(r.leave).toEqual({ paidDays: 1, unpaidDays: 1 });
  });

  it('gives a worked day its working type, routes, station, amounts and whether the report was sent', async () => {
    kit.planning.days.set('mr1:2026-09-10', { workingType: 'FIELD_WORK', routeIds: ['route-1'] });
    const dcr = await kit.dcrs.getOrCreate('mr1', '2026-09-10');
    await kit.approvals.submit({ kind: 'DCR', recordId: dcr.id, submitterId: 'mr1' });
    await claim('2026-09-10', 'TA', 8000, 'route-1');
    await claim('2026-09-10', 'DA', 20000, 'route-1');
    await claim('2026-09-10', 'OTHER', 1500);
    const day = (await review.review(ACCOUNTANT, 'mr1', '2026-09')).days.find((d) => d.date === '2026-09-10')!;
    expect(day).toMatchObject({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', station: 'EX_STATION', dcr: 'SUBMITTED', taPaise: 8000, daPaise: 20000, otherPaise: 1500, totalPaise: 29500 });
    expect(day.routes).toEqual([{ id: 'route-1', name: 'Route 1', routeType: 'EX_STATION' }]);
    expect(day.others).toHaveLength(1);
  });

  it('shows a day with no plan and no report as not sent, and a taken-back or decided report as it stands', async () => {
    kit.planning.days.set('mr1:2026-09-09', { workingType: 'FIELD_WORK', routeIds: [] });
    const done = await kit.dcrs.getOrCreate('mr1', '2026-09-09');
    await kit.approvals.submit({ kind: 'DCR', recordId: done.id, submitterId: 'mr1', autoApprove: true });
    const draft = await kit.dcrs.getOrCreate('mr1', '2026-09-08'); // a record with no request yet: a draft
    expect(draft.id).toBeTruthy();
    const r = await review.review(HR, 'mr1', '2026-09');
    const by = (d: string) => r.days.find((x) => x.date === d)!;
    expect(by('2026-09-09').dcr).toBe('APPROVED');
    expect(by('2026-09-08').dcr).toBe('NOT_SUBMITTED');
    expect(by('2026-09-07')).toMatchObject({ dcr: 'NOT_SUBMITTED', workingType: null, station: null, routes: [] });
  });

  it('claims everything but marks a day whose report is not approved as not counted', async () => {
    await claim('2026-09-10', 'TA', 8000, 'route-1');
    await claim('2026-09-10', 'DA', 20000, 'route-1');
    await claim('2026-09-11', 'TA', 5000, 'route-1', false); // a rejected report's day
    await claim('2026-09-11', 'DA', 4000, 'route-1', false);
    const r = await review.review(HR, 'mr1', '2026-09');
    const by = (d: string) => r.days.find((x) => x.date === d)!;
    expect(by('2026-09-10').taDaAccepted).toBe(true);
    expect(by('2026-09-11')).toMatchObject({ taDaAccepted: false, taPaise: 5000, daPaise: 4000 });
    expect(by('2026-09-12').taDaAccepted).toBeNull();
    expect(r.totals.totalPaise).toBe(37000);
    expect(r.acceptedPaise).toBe(28000);
    const row = (await overview.execute(HR, '2026-09')).rows.find((x) => x.userId === 'mr1')!;
    expect(row).toMatchObject({ totalPaise: 37000, acceptedPaise: 28000 }); // the table and the review say the same
  });

  it('stops at today for the month in progress', async () => {
    const r = await review.review(HR, 'mr1', '2026-10');
    expect(r.days.map((d) => d.date)).toEqual(eachDay('2026-10-01', '2026-10-05'));
  });

  it('is for Admin, HR and the Accountant only', async () => {
    await expect(review.review(MR, 'mr1', '2026-09')).rejects.toMatchObject({ statusCode: 403 });
    await expect(overview.execute(MR, '2026-09')).rejects.toMatchObject({ statusCode: 403 });
    await expect(review.review(HR, 'nobody', '2026-09')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('the month table lists every active field employee, with the accepted amounts and where the month stands', async () => {
    await claim('2026-09-10', 'TA', 8000);
    await claim('2026-09-10', 'DA', 20000);
    await claim('2026-09-10', 'OTHER', 1500);
    let sheet = await overview.execute(ACCOUNTANT, '2026-09');
    expect(sheet.payoutDueDate).toBe('2026-10-15');
    const row = (id: string) => sheet.rows.find((r) => r.userId === id)!;
    expect(row('mr1')).toMatchObject({ userName: 'mr1', employeeCode: 'MR1', taPaise: 8000, daPaise: 20000, otherPaise: 1500, totalPaise: 29500, status: 'NOT_SUBMITTED', submittedAt: null });
    expect(row('mr2')).toMatchObject({ totalPaise: 0, status: 'NOT_SUBMITTED' });
    await svc.submit('mr1', '2026-09');
    sheet = await overview.execute(HR, '2026-09');
    expect(sheet.rows.find((r) => r.userId === 'mr1')).toMatchObject({ status: 'SUBMITTED' });
    expect(sheet.rows.find((r) => r.userId === 'mr1')!.submittedAt).not.toBeNull();
  });
});
