import type { MonthlyPlanDetailDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';
import { DAY_KIND_LABEL, ROUTE_TYPE_LABEL, WORKING_TYPE_LABEL } from '@/features/approvals/lib/review';

export const MONTHLY_PLAN_CSV_HEADER = [
  'Date',
  'Weekday',
  'Day',
  'Holiday',
  'Working type',
  'Day kind',
  'Routes',
  'Route types',
  'Work with',
  'Remarks',
  'Return date',
  'Plan status',
] as const;

const WEEKDAY = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long' });
const dayOf = (date: string) => new Date(`${date}T00:00:00Z`);

/** Every `YYYY-MM-DD` of a `YYYY-MM`. */
export function datesOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * One employee's month, one row per calendar day: what is planned, and for the days with nothing planned whether it is a weekly off,
 * a holiday or just empty. A trip's stay and return days are real plan entries and are listed with their day kind.
 * `routeLabel` and `personName` name ids; both are looked up before this runs.
 */
export function monthlyPlanCsv(
  plan: Pick<MonthlyPlanDetailDto, 'planMonth' | 'entries' | 'offDays' | 'routes' | 'status'>,
  names: { routeLabel: (routeId: string) => string; personName: (userId: string) => string },
): string {
  const entries = new Map(plan.entries.map((e) => [e.planDate, e]));
  const off = new Map(plan.offDays.map((d) => [d.date, d]));
  const routeType = new Map(plan.routes.map((r) => [r.id, ROUTE_TYPE_LABEL[r.routeType]]));
  return toCsv(
    MONTHLY_PLAN_CSV_HEADER,
    datesOfMonth(plan.planMonth).map((date) => {
      const entry = entries.get(date);
      const lock = off.get(date);
      const kind = entry ? 'Planned' : lock ? (lock.reason === 'HOLIDAY' ? 'Holiday' : 'Weekly off') : 'Not planned';
      return [
        date,
        WEEKDAY.format(dayOf(date)),
        kind,
        lock?.reason === 'HOLIDAY' ? lock.name : null,
        entry ? WORKING_TYPE_LABEL[entry.workingType] : null,
        entry ? (entry.dayKind === 'NORMAL' ? 'Normal' : DAY_KIND_LABEL[entry.dayKind]) : null,
        entry?.routeIds.map(names.routeLabel).join('; ') || null,
        entry?.routeIds.map((id) => routeType.get(id) ?? '—').join('; ') || null,
        entry?.workWith.map(names.personName).join('; ') || null,
        entry?.remarks,
        entry?.returnDate,
        plan.status,
      ];
    }),
  );
}

/** Only an approved plan is the one the employee works to; a draft, a waiting, rejected, withdrawn or reopened one is not handed out. */
export const isDownloadable = (status: string): boolean => status === 'APPROVED';

export const notApprovedMessage = (month: string): string =>
  `No approved plan for ${new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(dayOf(`${month}-01`))}.`;
