import { datesInMonth, weekdayName } from '@/offline/day';

import { rupeesCell, toCsv } from './csv';
import { STATUS_TEXT, type ExpenseStatement } from './expense-months';
import { routeNamesText, workingTypeLabel, type MonthlyPlanEntry, type NamedRoute } from './planning';

/**
 * The CSV layouts the app downloads, shared by the employee's own screens and a manager's view of someone in their team, so both
 * files read the same.
 */

type PlanNames = {
  /** "Weekly off" / "Holiday · Diwali" for a locked day, null for a working day. */
  offLabel: (date: string) => string | null;
  routes: NamedRoute[] | undefined;
  personName: (userId: string) => string | null;
};

/** A month's Tour Plan, one row per day: off days and days left unplanned included, so it reads down the calendar. */
export function tourPlanCsv(month: string, entries: MonthlyPlanEntry[], names: PlanNames): string {
  const byDate = new Map(entries.map((e) => [e.planDate, e]));
  const rows = datesInMonth(month).map((d) => {
    const e = byDate.get(d);
    if (!e) return [d, weekdayName(d), names.offLabel(d) ?? 'Not planned', '', '', '', ''];
    const trip = e.dayKind === 'STAY' ? 'Stay day' : e.dayKind === 'TRANSIT' ? 'Return day' : '';
    const routes = e.routeIds.length > 0 ? routeNamesText(e.routeIds, names.routes) : '';
    const people = e.workWith.map((id) => names.personName(id) ?? 'Colleague').join('; ');
    return [d, weekdayName(d), workingTypeLabel(e.workingType), trip, routes, people, e.remarks];
  });
  return toCsv(['Date', 'Day', 'Work type', 'Trip', 'Routes', 'Work with', 'Remarks'], rows);
}

/** A month's expense statement, one row per date, then a total row carrying the month's status. */
export function expensesCsv(statement: ExpenseStatement): string {
  const rows = statement.days.map((d) => [
    d.date,
    rupeesCell(d.taPaise),
    rupeesCell(d.daPaise),
    rupeesCell(d.otherPaise),
    d.others.map((o) => `${rupeesCell(o.amountPaise)}${o.remarks ? ` ${o.remarks}` : ''}`).join('; '),
    rupeesCell(d.totalPaise),
  ]);
  const t = statement.totals;
  rows.push(['Total', rupeesCell(t.taPaise), rupeesCell(t.daPaise), rupeesCell(t.otherPaise), STATUS_TEXT[statement.status], rupeesCell(t.totalPaise)]);
  return toCsv(['Date', 'TA (₹)', 'DA (₹)', 'Other (₹)', 'Other details', 'Day total (₹)'], rows);
}

/** File names carry whose and which month: `tour-plan-EMP03-2026-11.csv`. */
export const exportFileName = (what: 'tour-plan' | 'expenses', employeeCode: string | undefined, month: string) =>
  `${what}-${employeeCode ?? 'me'}-${month}.csv`;
