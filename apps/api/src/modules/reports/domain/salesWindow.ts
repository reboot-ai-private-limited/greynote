import type { SalesPeriodKind } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { yearMonths } from './salesFigures.js';

/**
 * The months a sales report covers: the whole financial year, one quarter of it (1 to 4, counted from the year's first month) or one month of it.
 * `firstDay` is the year's first day (`YYYY-MM-DD`). A month or quarter outside the year is a 400.
 */
export function windowMonths(input: { firstDay: string; period: SalesPeriodKind; month?: string | undefined; quarter?: number | undefined }): string[] {
  const all = yearMonths(input.firstDay);
  if (input.period === 'year') return all;
  if (input.period === 'quarter') {
    const q = input.quarter;
    if (!q || q < 1 || q > 4) throw AppError.badRequest('Pick a quarter from 1 to 4.', { field: 'quarter' });
    return all.slice((q - 1) * 3, q * 3);
  }
  if (!input.month || !all.includes(input.month)) throw AppError.badRequest('That month is not in the financial year.', { field: 'month' });
  return [input.month];
}
