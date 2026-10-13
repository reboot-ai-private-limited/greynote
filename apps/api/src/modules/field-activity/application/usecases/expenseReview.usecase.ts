import type { ExpenseAdjustmentDto, ExpenseOverviewDto, ExpenseReviewDayDto, ExpenseReviewDto, ExpenseStageDto, ReviewDayTypeDto, ReviewStationDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { monthRange, parseCalendarMonth } from '@/shared/time/businessTime.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { ExpenseAdjustmentRepositoryPort } from '../../domain/expenseAdjustment.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { LeavePort } from '../../domain/leave.port.js';
import type { PlanningPort } from '../../domain/planning.port.js';
import type { ExpenseMonthRepositoryPort, ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrClock } from '../dcrClock.js';
import { dcrStatus } from '../dcrStatus.js';
import { EXPENSE_MONTH_KIND, expenseMonthStatusOf, totalsOf, type ExpenseMonthService } from './expenseMonth.usecase.js';
import type { Actor } from './readDcrs.usecase.js';

/** HR reviews and edits, the Accountant finalizes and pays, Admin does everything (decision-log 2026-10-13). */
const OFFICE_ROLES: ReadonlyArray<Actor['role']> = ['ADMIN', 'HR', 'ACCOUNTANT'];
const assertOffice = (actor: Actor) => {
  if (!OFFICE_ROLES.includes(actor.role)) throw AppError.forbidden();
};

/** Every calendar day from `from` to `to`, both inclusive (`YYYY-MM-DD`). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** The month's stage: its own status, then Finalized once the Accountant has closed it, and Paid when every accepted amount has been paid. */
export function stageOf(status: ExpenseStageDto, finalized: boolean, acceptedPaise: number, paidPaise: number): ExpenseStageDto {
  if (!finalized) return status;
  return acceptedPaise > 0 && paidPaise >= acceptedPaise ? 'PAID' : 'FINALIZED';
}

const STATION_RANK: Record<ReviewStationDto, number> = { HQ: 0, EX_STATION: 1, OUT_STATION: 2 };

/**
 * One employee's month, day by day, for the people who review it: why a day pays what it pays. Each day says what it was (working,
 * weekly off, holiday, paid or unpaid leave), what was planned (working type, routes, HQ / ex-station / out-station), whether the
 * day's report was sent, and the TA, DA and other amounts. The amounts are the statement's own rows; nothing here changes them.
 */
export class ExpenseReviewService {
  constructor(
    private readonly months: ExpenseMonthService,
    private readonly expenses: ExpenseRepositoryPort,
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly planning: PlanningPort,
    private readonly territory: TerritoryPort,
    private readonly leave: LeavePort,
    private readonly users: UserDirectoryPort,
    private readonly clock: DcrClock,
    private readonly adjustments: ExpenseAdjustmentRepositoryPort,
    private readonly monthRecords: ExpenseMonthRepositoryPort,
  ) {}

  async review(actor: Actor, userId: string, month: string): Promise<ExpenseReviewDto> {
    assertOffice(actor);
    parseCalendarMonth(month);
    const person = await this.users.findUserSummary(userId);
    if (!person) throw AppError.notFound('No such employee.');
    const range = monthRange(month);
    const today = await this.clock.today();
    const lastDay = today < range.to ? today : range.to;
    const dates = lastDay < range.from ? [] : eachDay(range.from, lastDay);

    const [statement, rows, dcrRows, leaveDays, offDates, holidayDates, adjustmentRows] = await Promise.all([
      this.months.statement(actor, userId, month),
      this.expenses.listForUserRange(userId, range),
      this.dcrs.listForUsers([userId], range.from, range.to),
      this.leave.listLeaveDays(userId, range.from, range.to),
      this.leave.listOffDates(userId, range.from, range.to),
      this.leave.listHolidayDates(userId, range.from, range.to),
      this.adjustments.listForUserMonth(userId, month),
    ]);
    const record = await this.monthRecords.find(userId, month);
    const acceptedPaise = rows.filter((r) => r.accepted).reduce((sum, r) => sum + r.amountPaise, 0);
    const editors = new Map((await this.users.getUserSummaries([...new Set([...adjustmentRows.map((a) => a.by), ...(record?.finalizedBy ? [record.finalizedBy] : [])])])).map((u) => [u.id, u]));
    const requests = await this.approvals.listForRecords('DCR', dcrRows.map((d) => d.id));
    const dcrStateOf = new Map<string, ExpenseReviewDayDto['dcr']>();
    for (const d of dcrRows) {
      const status = dcrStatus(requests.find((r) => r.recordId === d.id) ?? null);
      dcrStateOf.set(d.reportDate, status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : status === 'SUBMITTED' || status === 'MANAGER_APPROVED' ? 'SUBMITTED' : 'NOT_SUBMITTED');
    }
    const leaveByDate = new Map(leaveDays.map((l) => [l.date, l]));
    const off = new Set(offDates);
    const holidays = new Set(holidayDates);

    const routeCache = new Map<string, { id: string; name: string; routeType: ReviewStationDto } | null>();
    const routeOf = async (id: string) => {
      if (!routeCache.has(id)) {
        const r = await this.territory.getRoute(id);
        routeCache.set(id, r ? { id: r.id, name: r.name, routeType: r.routeType } : null);
      }
      return routeCache.get(id) ?? null;
    };

    const days: ExpenseReviewDayDto[] = [];
    for (const date of dates) {
      const plan = await this.planning.getDailyPlanDay(userId, date);
      const dayRows = rows.filter((r) => r.reportDate === date);
      // The plan's routes, and any route an expense row of the day is on (a day claimed on a route the plan did not name).
      const routeIds = [...new Set([...(plan?.routeIds ?? []), ...dayRows.flatMap((r) => (r.routeId ? [r.routeId] : []))])];
      const routes = (await Promise.all(routeIds.map(routeOf))).filter((r): r is NonNullable<typeof r> => r !== null);
      const station = routes.reduce<ReviewStationDto | null>((best, r) => (best === null || STATION_RANK[r.routeType] > STATION_RANK[best] ? r.routeType : best), null);
      const leaveDay = leaveByDate.get(date);
      const dayType: ReviewDayTypeDto = leaveDay ? 'LEAVE' : holidays.has(date) ? 'HOLIDAY' : off.has(date) ? 'WEEKLY_OFF' : 'WORKING';
      const totals = totalsOf(dayRows);
      days.push({
        date,
        dayType,
        leave: leaveDay ? { paid: leaveDay.paid, portion: leaveDay.portion, leaveType: leaveDay.leaveType } : null,
        workingType: plan?.workingType ?? null,
        dayKind: plan ? (plan.dayKind ?? 'NORMAL') : null,
        station,
        routes,
        dcr: dcrStateOf.get(date) ?? 'NOT_SUBMITTED',
        ...totals,
        taDaAccepted: dayRows.some((r) => r.type === 'TA' || r.type === 'DA') ? dayRows.filter((r) => r.type === 'TA' || r.type === 'DA').every((r) => r.accepted) : null,
        distanceFlag: dayRows.some((r) => r.distanceFlag),
        others: dayRows.filter((r) => r.type === 'OTHER').map((r) => ({ id: r.id, amountPaise: r.amountPaise, remarks: r.remarks })),
        rows: dayRows.map((r) => ({ id: r.id, type: r.type, amountPaise: r.amountPaise, originalAmountPaise: r.originalAmountPaise ?? null, source: r.source, remarks: r.remarks, paid: r.paymentStatus === 'PAID' })),
        adjustments: adjustmentRows
          .filter((x) => x.reportDate === date)
          .map((x): ExpenseAdjustmentDto => ({ id: x.id, expenseId: x.expenseId, type: x.type, kind: x.kind, beforePaise: x.beforePaise, afterPaise: x.afterPaise, reason: x.reason, by: { id: x.by, name: editors.get(x.by)?.name ?? '', role: x.byRole }, at: x.at.toISOString() })),
      });
    }
    const countLeave = (paid: boolean) => days.filter((d) => d.leave && d.leave.paid === paid).reduce((sum, d) => sum + (d.leave?.portion ?? 0), 0);
    return {
      userId,
      userName: person.name,
      employeeCode: person.employeeCode,
      month,
      status: statement.status,
      stage: stageOf(statement.status, record?.finalizedAt != null, acceptedPaise, statement.paidPaise),
      finalizedAt: record?.finalizedAt?.toISOString() ?? null,
      finalizedBy: record?.finalizedBy ? (editors.get(record.finalizedBy)?.name ?? '') : null,
      totals: statement.totals,
      acceptedPaise,
      submittedTotals: statement.submittedTotals,
      paidPaise: statement.paidPaise,
      deadlines: statement.deadlines,
      exceptions: statement.exceptions,
      leave: { paidDays: countLeave(true), unpaidDays: countLeave(false) },
      days,
    };
  }
}

/** The month table: every active field employee, with what was claimed, how much of it is accepted and paid, and where the month stands. */
export class ExpenseOverviewUseCase {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly monthRecords: ExpenseMonthRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, month: string): Promise<ExpenseOverviewDto> {
    assertOffice(actor);
    parseCalendarMonth(month);
    const summaries = await this.expenses.summarizeClaimedByMonth(monthRange(month));
    const byUser = new Map(summaries.filter((s) => s.month === month).map((s) => [s.userId, s]));
    const userIds = [...new Set([...(await this.users.listActiveFieldUserIds()), ...byUser.keys()])];
    const [people, records] = await Promise.all([this.users.getUserSummaries(userIds), this.monthRecords.listForUsers(userIds, month)]);
    const nameOf = new Map(people.map((u) => [u.id, u]));
    const recordOf = new Map(records.map((r) => [r.userId, r]));
    const requests = await this.approvals.listForRecords(EXPENSE_MONTH_KIND, records.map((r) => r.id));
    const requestOf = new Map(requests.map((r) => [r.recordId, r]));
    const rows = userIds
      .map((userId) => {
        const s = byUser.get(userId);
        const record = recordOf.get(userId);
        const taPaise = s?.taPaise ?? 0;
        const daPaise = s?.daPaise ?? 0;
        const otherPaise = s?.reimbursementPaise ?? 0;
        const status = record ? expenseMonthStatusOf(requestOf.get(record.id) ?? null) : ('NOT_SUBMITTED' as const);
        return {
          userId,
          userName: nameOf.get(userId)?.name ?? '',
          employeeCode: nameOf.get(userId)?.employeeCode ?? '',
          taPaise,
          daPaise,
          otherPaise,
          totalPaise: taPaise + daPaise + otherPaise,
          acceptedPaise: s?.acceptedPaise ?? 0,
          paidPaise: s?.paidPaise ?? 0,
          status,
          stage: stageOf(status, record?.finalizedAt != null, s?.acceptedPaise ?? 0, s?.paidPaise ?? 0),
          finalizedAt: record?.finalizedAt?.toISOString() ?? null,
          submittedAt: record?.submittedAt?.toISOString() ?? null,
          flaggedRows: s?.flaggedRows ?? 0,
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName));
    const [y, m] = month.split('-').map(Number) as [number, number];
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const payDay = Number(await this.config.get('EXPENSE_PAYOUT_DAY'));
    return { month, payoutDueDate: `${next}-${String(payDay).padStart(2, '0')}`, rows };
  }
}
