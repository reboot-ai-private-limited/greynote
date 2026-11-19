
import { rupeesCell, toCsv } from './csv';
import { STATUS_TEXT, type ExpenseStatement } from './expense-months';
import { workingTypeLabel } from './planning';
import { slug } from './slug';

/**
 * The CSV layouts the app downloads, shared by the employee's own screens and a manager's view of someone in their team, so both
 * files read the same.
 */

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


/**
 * File names carry whose and which month: `rahul-roy-mr-tour-plan-2026-11-emp03.csv` (docs/mobile/monthlyplan.md rule 22).
 * The person is the employee the file belongs to, never the manager downloading it. A name with no Latin letters starts with the
 * code instead (`emp03-tour-plan-2026-11.csv`); the designation is left out when there is none.
 */
export const exportFileName = (
  what: 'tour-plan' | 'expenses' | 'daily-plans',
  person: { name?: string | null; designation?: string | null; employeeCode?: string | null },
  month: string,
) => {
  const name = slug(person.name);
  const code = slug(person.employeeCode);
  if (!name) return `${[code, what, month].filter(Boolean).join('-')}.csv`;
  return `${[name, slug(person.designation), what, month, code].filter(Boolean).join('-')}.csv`;
};

/** A team file's name: `team-expenses-2026-11.csv`. */
export const teamFileName = (what: 'expenses' | 'secondary', month: string) => `team-${what}-${month}.csv`;

/** A person's month of Daily Plans, one row per day (oldest first), with the day's report status, for a manager's download. */
export function dailyPlansCsv(
  days: { date: string; plan: { status: string; workingType: string; routes: { name: string }[]; workWith: { label: string }[]; remarks: string | null } | null; doctors: { planned: { name: string }[]; alsoVisited: { name: string }[] }; report: { status: string } | null }[],
): string {
  const rows = [...days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => [
    d.date,
    d.plan ? workingTypeLabel(d.plan.workingType as never) : '',
    d.plan?.routes.map((r) => r.name).join('; ') ?? '',
    d.plan?.workWith.map((p) => p.label).join('; ') ?? '',
    d.doctors.planned.map((x) => x.name).join('; '),
    d.doctors.alsoVisited.map((x) => x.name).join('; '),
    d.plan ? (d.plan.status === 'DRAFT' ? 'Not sent' : d.plan.status) : '',
    d.report ? d.report.status : 'No report',
    d.plan?.remarks ?? '',
  ]);
  return toCsv(['Date', 'Working type', 'Routes', 'Works with', 'Doctors planned', 'Also visited', 'Daily plan', 'Daily report', 'Remarks'], rows);
}
