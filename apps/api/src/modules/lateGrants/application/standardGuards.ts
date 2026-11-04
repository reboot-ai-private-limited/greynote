import type { LateGrantKind } from '../domain/lateGrant.entity.js';
import type { PeriodLockGuard } from '../domain/periodLock.port.js';
import { monthOfPeriod } from './kindRegistry.js';

const PLAN_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN', 'DCR_SUBMIT'] as const satisfies readonly LateGrantKind[];
const EXPENSE_KINDS = ['EXPENSE_SUBMIT', 'EXPENSE_APPROVE'] as const satisfies readonly LateGrantKind[];

/**
 * A plan decides the month's working days, which feed attendance and so the salary run: once Payroll has frozen the month's run,
 * a plan changing afterwards would leave the paid salary out of step with the attendance behind it.
 */
export function payrollLockGuard(isMonthFinalized: (userId: string, month: string) => Promise<boolean>): PeriodLockGuard {
  return {
    kinds: PLAN_KINDS,
    async check(userId, _kind, periodKey) {
      const month = monthOfPeriod(periodKey);
      return (await isMonthFinalized(userId, month)) ? `Payroll for ${month} is already finalized, so its plans can’t change. Ask for the payroll to be reopened first.` : null;
    },
  };
}

export interface ExpenseMonthState {
  submitted: boolean;
  finalized: boolean;
  hasPaid: boolean;
}

/**
 * Expenses (TA/DA) are worked out from the day's plan and report. Once a month is finalized for payout, or any of it is paid, nothing
 * upstream of it — the plans, or the statement itself — may be let through late. A statement merely sent can still be sent back, so
 * that doesn't lock the plans.
 */
export function expenseLockGuard(getState: (userId: string, month: string) => Promise<ExpenseMonthState>): PeriodLockGuard {
  return {
    kinds: [...PLAN_KINDS, ...EXPENSE_KINDS],
    async check(userId, _kind, periodKey) {
      const month = monthOfPeriod(periodKey);
      const state = await getState(userId, month);
      if (state.hasPaid) return `Some of the expenses for ${month} are already paid, so this can’t be let through late any more.`;
      if (state.finalized) return `The expenses for ${month} are finalized for payout, so this can’t be let through late any more.`;
      return null;
    },
  };
}
