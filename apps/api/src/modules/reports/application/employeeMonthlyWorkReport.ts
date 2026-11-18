import { AppError } from '@/shared/errors/AppError.js';
import { readBusinessDay, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, monthRange, parseMonthName } from '@/shared/time/businessTime.js';
import { fyLabel } from '../domain/secondarySheet.js';
import { buildDailyWork, type DailyWork, type DayInput } from '../domain/dailyWork.js';
import type { AttendancePort, DailyWorkActivityPort, DailyWorkPlanningPort, DoctorNamesPort, ExpenseStatementPort, FieldActivityPort, FieldRosterPort, IdentityPort, LeaveDaysPort, MasterPort, SalesPort, TerritoryPort } from '../domain/ports.js';

export interface EmployeeMonthlyWorkInput {
  actor: { id: string; role: string };
  userId: string;
  /** `YYYY-MM`; left out, the month that holds today. */
  month?: string | undefined;
}

export interface EmployeeMonthlyWorkModel {
  employee: { id: string; name: string; employeeCode: string; designation: string | null };
  work: DailyWork;
  /** The month of expenses as the person sees it: its state and what is paid. */
  /** "2026-27": the financial year the month is in. */
  financialYear: string;
  expenseMonth: { status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'; paidPaise: number };
}

const datesOf = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

const FIELD_TYPES = ['FIELD_WORK', 'DOCTOR_CAMPAIGN'];

/**
 * One employee's Monthly Work report (decision-log 2026-11-18): every day of the month with its kind (weekly off, holiday, paid or unpaid leave, worked, absent), the Tour Plan
 * against the Daily Plan, the report, the doctors planned, called, missed and carried, follow-ups, chemist calls, orders and that day's expenses, and the month's totals. The office reads anyone's, an employee their own, a manager their downline's. Reads only.
 */
export class EmployeeMonthlyWorkReport {
  constructor(
    private readonly planning: DailyWorkPlanningPort,
    private readonly activity: DailyWorkActivityPort,
    private readonly attendance: AttendancePort,
    private readonly sales: Pick<SalesPort, 'listOrders'>,
    private readonly territory: TerritoryPort,
    private readonly identity: IdentityPort & FieldRosterPort,
    private readonly master: Pick<MasterPort, 'listAssignedDoctors'> & DoctorNamesPort,
    private readonly expenses: ExpenseStatementPort & Pick<FieldActivityPort, 'listAcceptedExpenses'>,
    private readonly leaves: LeaveDaysPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(input: EmployeeMonthlyWorkInput): Promise<EmployeeMonthlyWorkModel> {
    await this.assertMayRead(input.actor, input.userId);
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const today = businessDate(this.now(), timeZone, dayStart);
    const month = input.month ?? today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw AppError.badRequest('Use a month like 2026-11.');
    const range = monthRange(month);
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const monthNo = Number(month.slice(5));
    const financialYear = fyLabel(monthNo >= startMonth ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1, startMonth);
    const dates = datesOf(range.from, range.to);

    const [who] = await this.identity.listFieldEmployees([input.userId]);
    const [summary] = who ? [] : await this.identity.getUserSummaries([input.userId]);
    if (!who && !summary) throw AppError.notFound('No such employee.');

    const [plans, tour, activity, attendance, orders, planned, assigned, statement, accepted, leaveDays] = await Promise.all([
      this.planning.listDailyPlanDays(input.userId, range.from, range.to),
      this.planning.listMonthlyPlanDays(input.userId, month),
      this.activity.getActivityRange(input.userId, range),
      this.attendance.getMonth(input.userId, month),
      this.sales.listOrders({ userId: input.userId, from: range.from, to: range.to, limit: 5000 }),
      this.planning.listPlannedDoctors(input.userId, month),
      this.master.listAssignedDoctors(input.userId),
      this.expenses.getExpenseStatement(input.userId, month),
      this.expenses.listAcceptedExpenses({ from: range.from, to: range.to, userId: input.userId, limit: 5000 }),
      this.leaves.listLeaveDays(input.userId, range.from, range.to),
    ]);
    const leaveOn = new Map(leaveDays.map((l) => [l.date, { paid: l.paid }]));
    const expenseOn = new Map(statement.days.map((d) => [d.date, d]));
    const flaggedOn = new Set(accepted.filter((e) => e.distanceFlag).map((e) => e.reportDate));

    const routeIds = [...new Set([...plans.flatMap((p) => p.routeIds), ...tour.flatMap((t) => t.routeIds)])];
    const routeName = new Map((await Promise.all(routeIds.map(async (id) => [id, (await this.territory.getRoute(id))?.name ?? 'Route'] as const))));
    const colleagueIds = [...new Set(plans.flatMap((p) => p.workWith))];
    const colleagues = new Map((colleagueIds.length ? await this.identity.getUserSummaries(colleagueIds) : []).map((u) => [u.id, u.name]));
    const doctorIds = [...new Set([...plans.flatMap((p) => p.doctorIds), ...activity.flatMap((a) => a.doctorCalls.map((c) => c.doctorId))])];
    const names = new Map<string, string>([...(doctorIds.length ? await this.master.getDoctorNames(doctorIds) : []).map((d) => [d.id, d.name] as const), ...assigned.map((d) => [d.id, d.name] as const)]);

    const planOf = new Map(plans.map((p) => [p.date, p]));
    const tourOf = new Map(tour.map((t) => [t.date, t]));
    const actOf = new Map(activity.map((a) => [a.date, a]));
    const attOf = new Map(attendance.days.map((d) => [d.date, d.status]));
    const ordersOn = new Map<string, { count: number; paise: number }>();
    for (const o of orders) {
      if (o.status === 'CANCELLED') continue;
      const v = ordersOn.get(o.orderDate) ?? { count: 0, paise: 0 };
      v.count += 1;
      v.paise += o.totalAmountPaise;
      ordersOn.set(o.orderDate, v);
    }
    const tourWords = (date: string): string | null => {
      const t = tourOf.get(date);
      if (!t) return null;
      const words = FIELD_TYPES.includes(t.workingType) ? (t.routeIds.length > 0 ? t.routeIds.map((id) => routeName.get(id) ?? 'Route').join(', ') : 'No route') : t.workingType.replace(/_/g, ' ').toLowerCase();
      return t.dayKind === 'STAY' ? `${words} · stay (trip)` : t.dayKind === 'TRANSIT' ? `${words} · return (trip)` : words;
    };

    const days: DayInput[] = dates.map((date) => {
      const p = planOf.get(date);
      const a = actOf.get(date);
      const geo = { pass: 0, fail: 0, other: 0 };
      for (const c of a?.doctorCalls ?? []) {
        if (c.geofence === 'PASS') geo.pass += 1;
        else if (c.geofence === 'FAIL') geo.fail += 1;
        else geo.other += 1;
      }
      return {
        date,
        attendance: attOf.get(date) ?? null,
        tourWords: tourWords(date),
        plan: p ? { status: p.status, workingType: p.workingType, routeNames: p.routeIds.map((id) => routeName.get(id) ?? 'Route'), workWith: p.workWith.map((id) => colleagues.get(id) ?? 'Colleague'), doctorIds: p.doctorIds, changedFromMonthly: p.changedFromMonthly, remarks: p.remarks } : null,
        report: a?.reportStatus ? { status: a.reportStatus } : null,
        calls: { doctorIds: (a?.doctorCalls ?? []).map((c) => c.doctorId), chemistCalls: a?.chemistCalls.length ?? 0, followups: a?.followups ?? 0, geofence: geo },
        orders: ordersOn.get(date) ?? { count: 0, paise: 0 },
        leave: leaveOn.get(date) ?? null,
        expenses: { taPaise: expenseOn.get(date)?.taPaise ?? 0, daPaise: expenseOn.get(date)?.daPaise ?? 0, otherPaise: expenseOn.get(date)?.otherPaise ?? 0, notes: (expenseOn.get(date)?.others ?? []).map((o) => o.remarks ?? '').filter(Boolean).join('; '), flagged: flaggedOn.has(date) },
      };
    });

    const targets = assigned.filter((d) => d.visitFrequency != null).map((d) => ({ doctorId: d.id, name: d.name, frequency: d.visitFrequency! }));
    const work = buildDailyWork({ month, dates, days, today, names, targets, planned });
    return { employee: { id: input.userId, name: who?.name ?? summary!.name, employeeCode: who?.employeeCode ?? summary!.employeeCode, designation: who?.designation ?? null }, work, financialYear, expenseMonth: { status: statement.status, paidPaise: statement.paidPaise } };
  }

  private async assertMayRead(actor: { id: string; role: string }, userId: string): Promise<void> {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT' || actor.role === 'HR' || actor.id === userId) return;
    if (actor.role === 'FIELD' && (await this.identity.getDownline(actor.id)).some((u) => u.id === userId)) return;
    throw AppError.forbidden('You can only download your own report and your team\'s.');
  }
}
