import { AppError } from '@/shared/errors/AppError.js';
import type { RoleName } from '@greynote/contracts';
import { assertTimeZone, businessDate, leaveYearOf, parseMonthName } from '@/shared/time/businessTime.js';
import { financialYearLabel, parseClosedYears } from '@/shared/time/financialYearClose.js';
import { findConfigDefinition } from '../../domain/configDefinitions.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

const KEY = 'FY_CLOSED_YEARS';

export interface FinancialYearCloseState {
  /** The year in progress, named by the year it starts in (2026 = 2026-27). */
  currentYear: number;
  closedYears: number[];
  /** Ended years that are still open, newest first — what can be closed now. */
  closableYears: number[];
}

async function valueOf(repository: SystemConfigRepositoryPort, key: string): Promise<string> {
  return (await repository.findByKey(key))?.value ?? findConfigDefinition(key)!.default;
}

/** Closing and reopening a financial year, and what the screen needs to offer (decision-log 2026-10-06). Admin only. */
export class FinancialYearClose {
  constructor(
    private readonly repository: SystemConfigRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async currentYear(): Promise<number> {
    const zone = await valueOf(this.repository, 'BUSINESS_TIMEZONE');
    assertTimeZone(zone);
    // A database not yet re-seeded has no day start: midnight, as before the setting existed.
    const dayStart = (await this.repository.findByKey('DAY_START_TIME'))?.value || '00:00';
    return leaveYearOf(businessDate(this.now(), zone, dayStart), parseMonthName(await valueOf(this.repository, 'FY_START_MONTH')));
  }

  private async closed(): Promise<number[]> {
    return parseClosedYears(await valueOf(this.repository, KEY));
  }

  async state(role: RoleName): Promise<FinancialYearCloseState> {
    if (role !== 'ADMIN') throw AppError.forbidden();
    const currentYear = await this.currentYear();
    const closedYears = await this.closed();
    // Up to five years back; an older year with nothing in it needs no closing.
    const closableYears = [1, 2, 3, 4, 5].map((n) => currentYear - n).filter((y) => !closedYears.includes(y));
    return { currentYear, closedYears, closableYears };
  }

  async close(actingUserId: string, role: RoleName, year: number): Promise<FinancialYearCloseState> {
    if (role !== 'ADMIN') throw AppError.forbidden();
    const current = await this.currentYear();
    if (year >= current) {
      throw AppError.badRequest(`Financial year ${financialYearLabel(year)} has not ended yet, so it cannot be closed.`, { field: 'year' });
    }
    const closed = await this.closed();
    if (closed.includes(year)) throw AppError.conflict(`Financial year ${financialYearLabel(year)} is already closed.`);
    return this.write(actingUserId, role, [...closed, year]);
  }

  async reopen(actingUserId: string, role: RoleName, year: number): Promise<FinancialYearCloseState> {
    if (role !== 'ADMIN') throw AppError.forbidden();
    const closed = await this.closed();
    if (!closed.includes(year)) throw AppError.conflict(`Financial year ${financialYearLabel(year)} is not closed.`);
    return this.write(actingUserId, role, closed.filter((y) => y !== year));
  }

  private async write(actingUserId: string, role: RoleName, years: number[]): Promise<FinancialYearCloseState> {
    const value = years.length === 0 ? 'NONE' : [...new Set(years)].sort((a, b) => a - b).join(',');
    if (!(await this.repository.updateValue(KEY, value, actingUserId))) {
      throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key: KEY });
    }
    return this.state(role);
  }
}
