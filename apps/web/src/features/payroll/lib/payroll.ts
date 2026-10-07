import type { GenerateOutcomeDto, PayrollRunDto, PayrollSkipReason } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { formatMoney } from '@/lib/format';
import { formatDays } from '@/features/hr/lib/days';
import { financialYearRange } from '@/lib/financial-year';

// ── Months ─────────────────────────────────────────────────────────────────────────────────

/** Payroll can be generated only for a month that has ended: the current month, and any later, would freeze a sheet that misses the rest of it. */
export function isGeneratable(month: string, today: string): boolean {
  return /^\d{4}-\d{2}$/.test(month) && month < today.slice(0, 7);
}

/** The most recent months that have ended, newest first: `['2026-09', '2026-08', …]`. */
export function endedMonths(today: string, count = 18): string[] {
  const [year = 0, month = 1] = today.slice(0, 7).split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 2 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * The months of a financial year that have ended, newest first. The payroll list is scoped to the year in view and refuses a month
 * outside it, so a month can only be chosen from the year being looked at; April of a new year has none yet.
 */
export function endedMonthsInYear(year: number, today: string): string[] {
  const { from } = financialYearRange(year);
  const start = from.slice(0, 7);
  const current = today.slice(0, 7);
  const out: string[] = [];
  let [y = 0, m = 1] = start.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    if (month < current) out.push(month);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));
}

/** The first and last day of a month, for the expense range that matters to it. */
export function monthBounds(month: string): { from: string; to: string } {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ── The sheet ──────────────────────────────────────────────────────────────────────────────

export interface RunTotals {
  employees: number;
  drafts: number;
  finalized: number;
  joinedInMonth: number;
  basePaise: number;
  taDaPaise: number;
  reimbursementPaise: number;
  deductionPaise: number;
  netPaise: number;
}

export function runTotals(runs: readonly PayrollRunDto[]): RunTotals {
  const t: RunTotals = { employees: runs.length, drafts: 0, finalized: 0, joinedInMonth: 0, basePaise: 0, taDaPaise: 0, reimbursementPaise: 0, deductionPaise: 0, netPaise: 0 };
  for (const r of runs) {
    if (r.status === 'DRAFT') t.drafts += 1;
    else t.finalized += 1;
    if (r.joinedInMonth) t.joinedInMonth += 1;
    t.basePaise += r.baseSalaryPaise;
    t.taDaPaise += r.totalTaDaPaise;
    t.reimbursementPaise += r.reimbursementPaise;
    t.deductionPaise += r.leaveDeductionPaise + r.absentDeductionPaise;
    t.netPaise += r.netPayablePaise;
  }
  return t;
}

export const draftRuns = <T extends Pick<PayrollRunDto, 'status'>>(runs: readonly T[]): T[] => runs.filter((r) => r.status === 'DRAFT');

/** The sheet is final when it has runs and every one is finalized. */
export function monthState(runs: readonly Pick<PayrollRunDto, 'status'>[]): 'none' | 'draft' | 'final' {
  if (runs.length === 0) return 'none';
  return runs.every((r) => r.status === 'FINALIZED') ? 'final' : 'draft';
}

/** The month's `net = base + TA/DA + reimbursement − leave deduction − absent deduction`, checked here so a sheet that does not add up is never shown as fine. */
export function netAddsUp(r: Pick<PayrollRunDto, 'baseSalaryPaise' | 'totalTaDaPaise' | 'reimbursementPaise' | 'leaveDeductionPaise' | 'absentDeductionPaise' | 'netPayablePaise'>): boolean {
  return r.baseSalaryPaise + r.totalTaDaPaise + r.reimbursementPaise - r.leaveDeductionPaise - r.absentDeductionPaise === r.netPayablePaise;
}

/** The absent deduction in words, like the leave deduction: whole days at a thirtieth of the base each. */
export function absentExplanation(r: Pick<PayrollRunDto, 'absentDays' | 'baseSalaryPaise' | 'absentDeductionPaise'>): string {
  if (r.absentDays === 0) return 'No absent days, so nothing is deducted.';
  return `${r.absentDays} absent ${r.absentDays === 1 ? 'day' : 'days'} × ${formatMoney(r.baseSalaryPaise)} ÷ 30 = ${formatMoney(r.absentDeductionPaise)} (working days with no report, leave or strike).`;
}

/** The deduction in words: `2.5 unpaid days × ₹30,000.00 ÷ 30 = ₹2,500.00`. A flat 30-day month, by decision, not the calendar's. */
export function deductionExplanation(r: Pick<PayrollRunDto, 'unpaidLeaveDays' | 'baseSalaryPaise' | 'leaveDeductionPaise'>): string {
  if (r.unpaidLeaveDays === 0) return 'No unpaid leave, so nothing is deducted.';
  const days = `${formatDays(r.unpaidLeaveDays)} unpaid ${r.unpaidLeaveDays === 1 ? 'day' : 'days'}`;
  return `${days} × ${formatMoney(r.baseSalaryPaise)} ÷ 30 = ${formatMoney(r.leaveDeductionPaise)} (rounded to the nearest paisa).`;
}

// ── Generating ─────────────────────────────────────────────────────────────────────────────

const SKIP_LABEL: Record<PayrollSkipReason, string> = {
  MONTH_NOT_ENDED: 'The month has not ended',
  ALREADY_FINALIZED: 'Already finalized',
  RUN_NOT_FOUND: 'No such run',
  USER_NOT_FOUND: 'No such employee',
  NOT_FIELD_EMPLOYEE: 'Not an active field employee',
  NO_CTC: 'No CTC',
  ERROR: 'Something went wrong',
};

export const skipLabel = (reason: PayrollSkipReason): string => SKIP_LABEL[reason] ?? reason;

export interface GenerateSummary {
  created: number;
  updated: number;
  skipped: Extract<GenerateOutcomeDto, { outcome: 'skipped' }>[];
}

export function summariseGenerate(outcomes: readonly GenerateOutcomeDto[]): GenerateSummary {
  const s: GenerateSummary = { created: 0, updated: 0, skipped: [] };
  for (const o of outcomes) {
    if (o.outcome === 'skipped') s.skipped.push(o);
    else if (o.outcome === 'created') s.created += 1;
    else s.updated += 1;
  }
  return s;
}

/** `12 created, 3 updated, 2 skipped`: leaving out what is zero. */
export function generateMessage(s: GenerateSummary): string {
  const parts = [s.created > 0 && `${s.created} created`, s.updated > 0 && `${s.updated} updated`, s.skipped.length > 0 && `${s.skipped.length} skipped`].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Nobody to generate for.';
}

/** Skipped because already finalized is expected on a re-run; anything else is something to look at. */
export const needsAttention = (s: GenerateSummary): GenerateSummary['skipped'] => s.skipped.filter((o) => o.reason !== 'ALREADY_FINALIZED');

// ── Finalizing ─────────────────────────────────────────────────────────────────────────────

export interface FinalizeResult {
  finalized: string[];
  failed: { id: string; message: string }[];
}

/** Finalizes each draft on its own. A run that is already final (a second tab) is a refusal for that row alone and stops nothing. */
export async function finalizeRuns(send: (id: string) => Promise<unknown>, ids: readonly string[]): Promise<FinalizeResult> {
  const result: FinalizeResult = { finalized: [], failed: [] };
  for (const id of ids) {
    try {
      await send(id);
      result.finalized.push(id);
    } catch (error) {
      result.failed.push({ id, message: error instanceof Error ? error.message : 'Could not finalize it.' });
    }
  }
  return result;
}

export function finalizeMessage(result: FinalizeResult, total: number): string {
  return result.failed.length === 0
    ? `${result.finalized.length} of ${total} finalized.`
    : `${result.finalized.length} of ${total} finalized. ${result.failed.length} could not be: they are unchanged.`;
}

// ── CSV ────────────────────────────────────────────────────────────────────────────────────

export const PAYROLL_CSV_HEADER = [
  'Employee code', 'Employee', 'Month', 'Base salary (INR)', 'TA and DA paid (INR)', 'Reimbursements paid (INR)', 'Unpaid leave days', 'Leave deduction (INR)', 'Absent days', 'Absent deduction (INR)', 'Net payable (INR)', 'Joined this month', 'Status',
] as const;

export function payrollCsv(runs: readonly PayrollRunDto[]): string {
  return toCsv(
    PAYROLL_CSV_HEADER,
    runs.map((r) => [
      r.employeeCode,
      r.userName,
      r.month,
      rupeesForCsv(r.baseSalaryPaise),
      rupeesForCsv(r.totalTaDaPaise),
      rupeesForCsv(r.reimbursementPaise),
      r.unpaidLeaveDays,
      rupeesForCsv(r.leaveDeductionPaise),
      r.absentDays,
      rupeesForCsv(r.absentDeductionPaise),
      rupeesForCsv(r.netPayablePaise),
      r.joinedInMonth ? 'Yes' : '',
      r.status === 'FINALIZED' ? 'Finalized' : 'Draft',
    ]),
  );
}

export const payrollFilename = (month: string): string => `payroll-${month}.csv`;
