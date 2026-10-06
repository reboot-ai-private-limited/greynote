import { AppError } from '@/shared/errors/AppError.js';
import { parseMonthName, leaveYearOf } from '@/shared/time/businessTime.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';

/** `NONE`, or comma-separated four-digit years — what `FY_CLOSED_YEARS` holds. */
export function parseClosedYears(value: string): number[] {
  if (value.toUpperCase() === 'NONE') return [];
  const years = value.split(',').map((y) => y.trim());
  if (years.some((y) => !/^\d{4}$/.test(y))) throw new RangeError(`Not a list of years: ${value}`);
  return years.map(Number);
}

export const financialYearLabel = (year: number): string => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

/**
 * Refuses a write that touches a date inside a financial year an Admin has closed (decision-log 2026-10-06). `date` is `YYYY-MM-DD`
 * (a month is `YYYY-MM-01`); `what` names the thing being changed, for the message. Reads and the year toggle are not affected.
 */
export async function assertFinancialYearOpen(config: ConfigReader, date: string, what: string): Promise<void> {
  const closed = await readConfig(config, 'FY_CLOSED_YEARS', parseClosedYears);
  if (closed.length === 0) return;
  const year = leaveYearOf(date, await readConfig(config, 'FY_START_MONTH', parseMonthName));
  if (closed.includes(year)) {
    throw AppError.conflict(`${what} belongs to financial year ${financialYearLabel(year)}, which has been closed. Ask an Admin to reopen it.`, {
      code: 'FY_CLOSED',
      financialYear: year,
    });
  }
}
