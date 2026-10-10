import type { LeaveBalance } from '../domain/leaveBalance.entity.js';
import { availableDays, proratedAllocation } from '../domain/leaveBalance.entity.js';
import type { LeaveBalanceRepositoryPort } from '../domain/leaveBalance.repository.port.js';
import type { LeavePolicyRepositoryPort } from '../domain/leavePolicy.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import type { HrCalendar } from './hrCalendar.js';

export interface LeaveBalanceView extends LeaveBalance {
  leaveTypeName: string;
  availableDays: number;
}

/**
 * Seeds an employee's balances for a leave year the first time they're needed (decision-log
 * 2026-09-28): one row per paid type, from their Pay Band's Leave Master days (0 where none is
 * set), pro-rata if they joined during that year. Rows that already exist are never touched — a
 * later Leave Master change applies only to balances seeded after it.
 */
export class LeaveBalances {
  constructor(
    private readonly balances: LeaveBalanceRepositoryPort,
    private readonly policies: LeavePolicyRepositoryPort,
    private readonly types: LeaveTypeRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly calendar: HrCalendar,
  ) {}

  /** `[]` for someone with no Pay Band (or no employee profile) — they have no paid leave. */
  async ensureSeeded(userId: string, year: number): Promise<LeaveBalance[]> {
    const employment = await this.users.getEmploymentDetails(userId);
    if (!employment?.payBandId) return [];

    const [paidTypes, policies, range, joinedOn] = await Promise.all([
      this.types.list().then((ts) => ts.filter((t) => t.isPaid)),
      this.policies.listForPayBand(employment.payBandId),
      this.calendar.leaveYearRange(year),
      employment.dateOfJoining ? this.calendar.calendarDateOf(employment.dateOfJoining) : Promise.resolve(null),
    ]);
    const defaults = new Map(policies.map((p) => [p.leaveTypeId, p.defaultDays]));
    await this.balances.insertMissing(
      paidTypes.map((t) => ({
        userId,
        leaveTypeId: t.id,
        year,
        allocatedDays: proratedAllocation(defaults.get(t.id) ?? 0, range, joinedOn),
      })),
    );
    return this.balances.listForUser(userId, year);
  }

  /**
   * `seed: false` shows only the rows that exist and writes nothing — for a leave year that is already over, where
   * creating balances would be inventing history (and a past-year view must never write; docs/hld/09).
   */
  async views(userId: string, year: number, options: { seed?: boolean } = {}): Promise<LeaveBalanceView[]> {
    const [rows, types] = await Promise.all([options.seed === false ? this.balances.listForUser(userId, year) : this.ensureSeeded(userId, year), this.types.list()]);
    const names = new Map(types.map((t) => [t.id, t.name]));
    return rows
      .map((b) => ({ ...b, leaveTypeName: names.get(b.leaveTypeId) ?? '', availableDays: availableDays(b) }))
      .sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName));
  }
}
