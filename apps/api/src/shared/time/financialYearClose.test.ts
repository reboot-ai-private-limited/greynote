import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { assertFinancialYearOpen, financialYearLabel, parseClosedYears } from './financialYearClose.js';

const config = (values: Record<string, string>) => ({ get: async (key: string) => values[key] ?? '' });
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as AppError);

describe('financial-year close guard', () => {
  it('parses NONE and lists, and refuses anything else', () => {
    expect(parseClosedYears('NONE')).toEqual([]);
    expect(parseClosedYears('2024,2025')).toEqual([2024, 2025]);
    expect(() => parseClosedYears('2024,x')).toThrow();
    expect(financialYearLabel(2025)).toBe('2025-26');
    expect(financialYearLabel(2099)).toBe('2099-00');
  });

  it('lets everything through while nothing is closed', async () => {
    expect(await refusal(assertFinancialYearOpen(config({ FY_CLOSED_YEARS: 'NONE', FY_START_MONTH: 'APRIL' }), '2020-01-01', 'x'))).toBeNull();
  });

  it('refuses a date inside a closed year, by the year start month, with a 409 naming the year', async () => {
    const c = config({ FY_CLOSED_YEARS: '2025', FY_START_MONTH: 'APRIL' });
    expect(await refusal(assertFinancialYearOpen(c, '2025-04-01', 'This payroll month'))).toMatchObject({ statusCode: 409 });
    expect(await refusal(assertFinancialYearOpen(c, '2026-03-31', 'This payroll month'))).toMatchObject({ statusCode: 409 });
    const err = await refusal(assertFinancialYearOpen(c, '2026-03-01', 'This payroll month'));
    expect(err?.message).toBe('This payroll month belongs to financial year 2025-26, which has been closed. Ask an Admin to reopen it.');
  });

  it('the day before and after the year are open; other years are open', async () => {
    const c = config({ FY_CLOSED_YEARS: '2025', FY_START_MONTH: 'APRIL' });
    expect(await refusal(assertFinancialYearOpen(c, '2025-03-31', 'x'))).toBeNull();
    expect(await refusal(assertFinancialYearOpen(c, '2026-04-01', 'x'))).toBeNull();
  });

  it('follows the start month: with a January start, 2025 is the calendar year', async () => {
    const c = config({ FY_CLOSED_YEARS: '2025', FY_START_MONTH: 'JANUARY' });
    expect(await refusal(assertFinancialYearOpen(c, '2025-12-31', 'x'))).toMatchObject({ statusCode: 409 });
    expect(await refusal(assertFinancialYearOpen(c, '2026-01-01', 'x'))).toBeNull();
  });
});
