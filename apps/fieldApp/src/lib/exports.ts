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

/** Lower case `a-z` and `0-9` joined by single hyphens; accents fold to the plain letter, anything else is dropped (`Zoë D'Souza` → `zoe-d-souza`). */
const slug = (s: string | null | undefined) =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * File names carry whose and which month: `rahul-roy-mr-tour-plan-2026-11-emp03.csv` (docs/mobile/monthlyplan.md rule 22).
 * The person is the employee the file belongs to, never the manager downloading it. A name with no Latin letters starts with the
 * code instead (`emp03-tour-plan-2026-11.csv`); the designation is left out when there is none.
 */
export const exportFileName = (
  what: 'tour-plan' | 'expenses',
  person: { name?: string | null; designation?: string | null; employeeCode?: string | null },
  month: string,
) => {
  const name = slug(person.name);
  const code = slug(person.employeeCode);
  if (!name) return `${[code, what, month].filter(Boolean).join('-')}.csv`;
  return `${[name, slug(person.designation), what, month, code].filter(Boolean).join('-')}.csv`;
};
