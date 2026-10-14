import { MAX_PAISE, proratePaise, type Paise } from '@/shared/money/paise.js';
import type { PayrollAdjustment, PayrollDay } from '../domain/payrollRun.entity.js';
import type { CtcLineSnapshot } from '../domain/ports.js';

/** A month is priced as 30 days whatever its length (HLD 7): more unpaid days than that cannot deduct more than the base. */
export const DEDUCTION_DAYS = 30;

/**
 * `unpaidDays × base ÷ 30`, rounded half up to a whole paise once. Unpaid days come in halves (a half-day leave is 0.5);
 * anything else is a fault upstream, not something to round. Days beyond 30 count as 30.
 */
export function leaveDeductionPaise(unpaidDays: number, baseSalaryPaise: Paise): Paise {
  const halves = Math.round(unpaidDays * 2);
  if (!Number.isFinite(unpaidDays) || unpaidDays < 0 || Math.abs(unpaidDays * 2 - halves) > 1e-9) throw new RangeError(`Unpaid days must be whole or half days: ${unpaidDays}`);
  return proratePaise(baseSalaryPaise, Math.min(halves, DEDUCTION_DAYS * 2), DEDUCTION_DAYS * 2);
}

/**
 * How many absent days can be charged on top of the unpaid leave: whole days only, and together with the leave never more than a month
 * (30 days), so the deductions never exceed the base.
 */
export function chargeableAbsentDays(unpaidLeaveDays: number, deductibleDays: number): number {
  if (!Number.isFinite(deductibleDays) || deductibleDays < 0 || !Number.isInteger(deductibleDays)) throw new RangeError(`Deductible days must be whole days: ${deductibleDays}`);
  return Math.min(deductibleDays, Math.max(0, Math.floor(DEDUCTION_DAYS - unpaidLeaveDays)));
}

/** `days × base ÷ 30`, rounded half up to a whole paise once — an absent day costs what an unpaid-leave day does. */
export function absentDeductionPaise(days: number, baseSalaryPaise: Paise): Paise {
  if (!Number.isInteger(days) || days < 0 || days > DEDUCTION_DAYS) throw new RangeError(`Absent days must be whole days from 0 to ${DEDUCTION_DAYS}: ${days}`);
  return proratePaise(baseSalaryPaise, days, DEDUCTION_DAYS);
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
 * charging a worked day takes one off. A day is `base ÷ 30`, rounded half up once; halves come out of the same rounding.
 */
export function dayAdjustmentPaise(baseSalaryPaise: Paise, ruleDays: number, setDays: number): number {
  const halves = Math.round((setDays - ruleDays) * 2);
  if (halves === 0) return 0;
  const amount = proratePaise(baseSalaryPaise, Math.abs(halves), DEDUCTION_DAYS * 2);
  return halves > 0 ? -amount : amount;
}

/**
 * The effect of a run's adjustments on its net, and each one's effect now. The latest change to a date counts and an earlier one to the same
 * date counts for nothing; the rules' own charge for the day is read from the run's days as they are now (a regenerated draft may differ), so a
 * day change keeps meaning "charge this day X" whatever the rules say later.
 */
export function adjustmentEffects(baseSalaryPaise: Paise, days: readonly PayrollDay[], adjustments: readonly PayrollAdjustment[]): { totalPaise: number; effects: Map<string, number> } {
  const latest = new Map<string, string>();
  for (const a of adjustments) if (a.kind === 'DAY' && a.date) latest.set(a.date, a.id);
  const effects = new Map<string, number>();
  let totalPaise = 0;
  for (const a of adjustments) {
    let effect = 0;
    if (a.kind === 'AMOUNT') effect = a.amountPaise;
    else if (a.date && latest.get(a.date) === a.id && a.setDays !== null) {
      const rule = days.find((d) => d.date === a.date)?.deductedDays ?? a.ruleDays ?? 0;
      effect = dayAdjustmentPaise(baseSalaryPaise, rule, a.setDays);
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
