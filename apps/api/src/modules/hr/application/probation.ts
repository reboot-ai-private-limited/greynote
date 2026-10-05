import { readConfig, parseBoolean, type ConfigReader } from '@/shared/config/readConfig.js';
import type { HrCalendar } from './hrCalendar.js';
import { probationEndsOn } from '../domain/probation.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

const parseMonths = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 36) throw new RangeError(`Not a whole number from 0 to 36: ${value}`);
  return n;
};

/**
 * Who is on probation, and until when (decision-log 2026-10-05). Probation runs from the joining date for the employee's own
 * `probationMonths`, else the `PROBATION_MONTHS` setting. With `PROBATION_LEAVE_PAID` off, or no joining date, or 0 months, nobody
 * is treated as on probation at all.
 */
export class Probation {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly calendar: HrCalendar,
  ) {}

  /** The first day after probation, or null when this person has no probation that matters for paying leave. */
  async endsOn(userId: string): Promise<string | null> {
    if (!(await readConfig(this.config, 'PROBATION_LEAVE_PAID', parseBoolean))) return null;
    const employment = await this.users.getEmploymentDetails(userId);
    if (!employment?.dateOfJoining) return null;
    const months = employment.probationMonths ?? (await readConfig(this.config, 'PROBATION_MONTHS', parseMonths));
    if (months === 0) return null;
    return probationEndsOn(await this.calendar.dateOf(employment.dateOfJoining), months);
  }
}
