import { AppError } from '@/shared/errors/AppError.js';
import { parseCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import type { LateGrantKind } from '../domain/lateGrant.entity.js';

export interface KindMeta {
  kind: LateGrantKind;
  label: string;
  group: 'Plans' | 'Expenses' | 'Sales';
  /** `DAY` periods are `YYYY-MM-DD`, `MONTH` periods `YYYY-MM`. */
  period: 'DAY' | 'MONTH';
  /** Config keys: may a manager grant it, default and longest length in hours. */
  config: { byManager: string; validHours: string; maxHours: string };
  /** The fallbacks when a key hasn't been seeded yet. */
  fallback: { validHours: number; maxHours: number };
}

const PLAN = { byManager: 'LATE_PLAN_GRANT_BY_MANAGER', validHours: 'LATE_PLAN_GRANT_VALID_HOURS', maxHours: 'LATE_PLAN_GRANT_MAX_HOURS' };
const EXPENSE = { byManager: 'LATE_EXPENSE_GRANT_BY_MANAGER', validHours: 'LATE_EXPENSE_GRANT_VALID_HOURS', maxHours: 'LATE_EXPENSE_GRANT_MAX_HOURS' };
const STOCK = { byManager: 'LATE_STOCK_GRANT_BY_MANAGER', validHours: 'LATE_STOCK_GRANT_VALID_HOURS', maxHours: 'LATE_STOCK_GRANT_MAX_HOURS' };

export const KIND_REGISTRY: Record<LateGrantKind, KindMeta> = {
  DAILY_PLAN: { kind: 'DAILY_PLAN', label: 'Daily plan', group: 'Plans', period: 'DAY', config: PLAN, fallback: { validHours: 24, maxHours: 744 } },
  MONTHLY_PLAN: { kind: 'MONTHLY_PLAN', label: 'Monthly plan', group: 'Plans', period: 'MONTH', config: PLAN, fallback: { validHours: 24, maxHours: 744 } },
  EXPENSE_SUBMIT: { kind: 'EXPENSE_SUBMIT', label: 'Expenses — send', group: 'Expenses', period: 'MONTH', config: EXPENSE, fallback: { validHours: 24, maxHours: 168 } },
  EXPENSE_APPROVE: { kind: 'EXPENSE_APPROVE', label: 'Expenses — approve', group: 'Expenses', period: 'MONTH', config: EXPENSE, fallback: { validHours: 24, maxHours: 168 } },
  MONTHLY_STOCK: { kind: 'MONTHLY_STOCK', label: 'Monthly stock count', group: 'Sales', period: 'MONTH', config: STOCK, fallback: { validHours: 72, maxHours: 336 } },
  SECONDARY_SALES: { kind: 'SECONDARY_SALES', label: 'Secondary sales and files', group: 'Sales', period: 'MONTH', config: STOCK, fallback: { validHours: 72, maxHours: 336 } },
};

/** `YYYY-MM` of a period key of any kind. */
export const monthOfPeriod = (periodKey: string): string => periodKey.slice(0, 7);

export function assertPeriodKey(kind: LateGrantKind, periodKey: string): void {
  const meta = KIND_REGISTRY[kind];
  try {
    if (meta.period === 'DAY') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) throw new RangeError('format');
      parseCalendarDate(periodKey);
    } else {
      if (!/^\d{4}-\d{2}$/.test(periodKey)) throw new RangeError('format');
      parseCalendarMonth(periodKey);
    }
  } catch {
    throw AppError.badRequest(
      meta.period === 'DAY' ? 'A daily plan is named by its date, YYYY-MM-DD.' : `${meta.label} is named by its month, YYYY-MM.`,
      { field: 'periodKey' },
    );
  }
}
