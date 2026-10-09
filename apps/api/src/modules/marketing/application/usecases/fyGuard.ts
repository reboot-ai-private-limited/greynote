import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, leaveYearOf, parseMonthName } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen, financialYearLabel } from '@/shared/time/financialYearClose.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';

/**
 * A target or an achievement belongs to a month, and a month must sit inside the financial year we are in now (decision-log 2026-10-09) — a
 * target for last year or for next year is refused, and so is any month of a year an Admin has closed.
 */
export async function assertMonthInCurrentFinancialYear(config: ConfigReader, month: string, now: Date, what: string): Promise<void> {
  const [startMonth, zone] = await Promise.all([
    readConfig(config, 'FY_START_MONTH', parseMonthName),
    readConfig(config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    }),
  ]);
  const current = leaveYearOf(businessDate(now, zone), startMonth);
  if (leaveYearOf(`${month}-01`, startMonth) !== current) {
    throw new MarketingRefusal(MARKETING_CODES.outsideFinancialYear, `${what} can only be set for a month of the current financial year (${financialYearLabel(current)}).`);
  }
  await assertFinancialYearOpen(config, `${month}-01`, what);
}
