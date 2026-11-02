import { MAX_PAISE, proratePaise, type Paise } from '@/shared/money/paise.js';
import type { PayrollAdjustment, PayrollDay } from '../domain/payrollRun.entity.js';
import type { CtcLineSnapshot } from '../domain/ports.js';

/** Runs generated before 2026-11-02 priced every month as 30 days; they carry no `payDays` and read as this. */
export const LEGACY_PAY_DAYS = 30;

/** The days a month is priced by (decision-log 2026-11-02): its calendar length, so October is ÷31, November ÷30, February ÷28 or ÷29. */
export function payDaysOf(month: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new RangeError(`Not a month: ${month}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

/**
 * `unpaidDays × base ÷ payDays`, rounded half up to a whole paise once. Unpaid days come in halves (a half-day leave is 0.5);
 * anything else is a fault upstream, not something to round. Days beyond the month count as the whole month.
 */
export function leaveDeductionPaise(unpaidDays: number, baseSalaryPaise: Paise, payDays: number = LEGACY_PAY_DAYS): Paise {
  const halves = Math.round(unpaidDays * 2);
  if (!Number.isFinite(unpaidDays) || unpaidDays < 0 || Math.abs(unpaidDays * 2 - halves) > 1e-9) throw new RangeError(`Unpaid days must be whole or half days: ${unpaidDays}`);
  return proratePaise(baseSalaryPaise, Math.min(halves, payDays * 2), payDays * 2);
}

/**
 * How many absent days can be charged on top of the unpaid leave: whole days only, and together with the leave never more than a month
 * (`payDays`), so the deductions never exceed the base.
 */
export function chargeableAbsentDays(unpaidLeaveDays: number, deductibleDays: number, payDays: number = LEGACY_PAY_DAYS): number {
  if (!Number.isFinite(deductibleDays) || deductibleDays < 0 || !Number.isInteger(deductibleDays)) throw new RangeError(`Deductible days must be whole days: ${deductibleDays}`);
  return Math.min(deductibleDays, Math.max(0, Math.floor(payDays - unpaidLeaveDays)));
}

/** `days × base ÷ payDays`, rounded half up to a whole paise once — an absent day costs what an unpaid-leave day does. */
export function absentDeductionPaise(days: number, baseSalaryPaise: Paise, payDays: number = LEGACY_PAY_DAYS): Paise {
  if (!Number.isInteger(days) || days < 0 || days > payDays) throw new RangeError(`Absent days must be whole days from 0 to ${payDays}: ${days}`);
  return proratePaise(baseSalaryPaise, days, payDays);
}

/**
 * `base + TA/DA + reimbursement − statutory deductions − leave deduction − absent deduction + rounding`. The leave and absent deductions
 * together are at most the base, and `statutoryTakenPaise` never takes more than what is left of it, so this is never negative.
 */
export function netPayablePaise(p: { baseSalaryPaise: Paise; totalTaDaPaise: Paise; reimbursementPaise: Paise; leaveDeductionPaise: Paise; absentDeductionPaise?: Paise; statutoryDeductionPaise?: Paise; roundingPaise?: number }): Paise {
  const net = p.baseSalaryPaise + p.totalTaDaPaise + p.reimbursementPaise - (p.statutoryDeductionPaise ?? 0) - p.leaveDeductionPaise - (p.absentDeductionPaise ?? 0) + (p.roundingPaise ?? 0);
  if (!Number.isSafeInteger(net) || net < 0 || net > MAX_PAISE * 3) throw new RangeError(`Net pay out of range: ${net}`);
  return net;
}

/**
 * What the employee is paid before any deduction, per month: the earning lines of the CTC (the CTC less the employer's own
 * EPF/ESI), ÷ 12, rounded half up once.
 */
export function monthlyGrossPaise(lines: readonly CtcLineSnapshot[]): Paise {
  const annual = lines.filter((l) => l.kind === 'EARNING').reduce((sum, l) => sum + l.amountPaise, 0);
  return proratePaise(annual, 1, 12);
}

/**
 * What setting a day to `setDays` instead of the `ruleDays` the rules gave does to the net: not charging an absent day adds a day of pay,
 * charging a worked day takes one off. A day is `base ÷ payDays`, rounded half up once; halves come out of the same rounding.
 */
export function dayAdjustmentPaise(baseSalaryPaise: Paise, ruleDays: number, setDays: number, payDays: number = LEGACY_PAY_DAYS): number {
  const halves = Math.round((setDays - ruleDays) * 2);
  if (halves === 0) return 0;
  const amount = proratePaise(baseSalaryPaise, Math.abs(halves), payDays * 2);
  return halves > 0 ? -amount : amount;
}

/**
 * The effect of a run's adjustments on its net, and each one's effect now. The latest change to a date counts and an earlier one to the same
 * date counts for nothing; the rules' own charge for the day is read from the run's days as they are now (a regenerated draft may differ), so a
 * day change keeps meaning "charge this day X" whatever the rules say later.
 */
export function adjustmentEffects(baseSalaryPaise: Paise, days: readonly PayrollDay[], adjustments: readonly PayrollAdjustment[], payDays: number = LEGACY_PAY_DAYS): { totalPaise: number; effects: Map<string, number> } {
  const latest = new Map<string, string>();
  for (const a of adjustments) if (a.kind === 'DAY' && a.date) latest.set(a.date, a.id);
  const effects = new Map<string, number>();
  let totalPaise = 0;
  for (const a of adjustments) {
    let effect = 0;
    if (a.kind === 'AMOUNT') effect = a.amountPaise;
    else if (a.date && latest.get(a.date) === a.id && a.setDays !== null) {
      const rule = days.find((d) => d.date === a.date)?.deductedDays ?? a.ruleDays ?? 0;
      effect = dayAdjustmentPaise(baseSalaryPaise, rule, a.setDays, payDays);
    }
    effects.set(a.id, effect);
    totalPaise += effect;
  }
  return { totalPaise, effects };
}

/** A line's monthly amount: one twelfth of the annual, rounded half up once. */
export const monthlyOfAnnualPaise = (annualPaise: Paise): Paise => proratePaise(annualPaise, 1, 12);

/** The employee's own EPF, ESI and professional tax for the month, from the CTC's deduction lines, one line each. */
export function deductionLinesOf(lines: readonly CtcLineSnapshot[]): Array<{ code: string; name: string; amountPaise: Paise }> {
  return lines.filter((l) => l.kind === 'DEDUCTION').map((l) => ({ code: l.code, name: l.name, amountPaise: monthlyOfAnnualPaise(l.amountPaise) }));
}

/**
 * What is actually taken for statutory deductions: all of them, unless the pay left after unpaid leave and absent days is smaller than
 * that, in which case no more than is left (so the net is never negative).
 */
export function statutoryTakenPaise(totalPaise: Paise, baseSalaryPaise: Paise, leaveDeductionPaise: Paise, absentDeductionPaise: Paise): Paise {
  return Math.max(0, Math.min(totalPaise, baseSalaryPaise - leaveDeductionPaise - absentDeductionPaise));
}

/** The net as a whole rupee, half up, and the signed difference to get there. */
export function roundNetToRupee(netPaise: Paise): { netPaise: Paise; roundingPaise: number } {
  const rounded = Math.floor((netPaise + 50) / 100) * 100;
  return { netPaise: rounded, roundingPaise: rounded - netPaise };
}
