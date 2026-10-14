import { readConfigOr, parsePositiveInt, type ConfigReader } from '@/shared/config/readConfig.js';
import type { PayrollRunRepositoryPort } from '../../domain/payroll.repository.port.js';
import type { IdentityPort } from '../../domain/ports.js';
import { complianceWarnings } from '../complianceWarnings.js';

const LIMIT = 1000;
/** The seeded `ESI_WAGE_CEILING`, for a database that has not been re-seeded since the setting was added. */
const DEFAULT_ESI_CEILING_RUPEES = 21_000;

export interface PayrollWarnings {
  /** The ceiling in force, in whole rupees, so the screen can say it. */
  esiCeilingRupees: number;
  esiMissing: Array<{ userId: string; name: string; employeeCode: string }>;
  epfMissing: Array<{ userId: string; name: string; employeeCode: string }>;
}

/**
 * Employees in a month's payroll whose ESI (under the ceiling) or EPF number is not set. Read **live** from the employee's profile, not
 * from the run's snapshot, so adding the number clears the warning without generating again. It never refuses anything.
 */
export class PayrollWarningsUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly identity: IdentityPort,
    private readonly config: ConfigReader,
  ) {}

  async execute(month: string): Promise<PayrollWarnings> {
    const esiCeilingRupees = await readConfigOr(this.config, 'ESI_WAGE_CEILING', parsePositiveInt(1_000_000), DEFAULT_ESI_CEILING_RUPEES);
    const runs = await this.runs.list({ month }, LIMIT);
    const rows = await Promise.all(
      runs.map(async (r) => {
        const employment = await this.identity.getEmploymentDetails(r.userId);
        return { userId: r.userId, baseSalaryPaise: r.baseSalaryPaise, esiNumber: employment?.esiNumber ?? null, epfNumber: employment?.epfNumber ?? null };
      }),
    );
    const { esiMissing, epfMissing } = complianceWarnings(rows, esiCeilingRupees * 100);
    const people = new Map((await this.identity.getUserSummaries([...new Set([...esiMissing, ...epfMissing])])).map((u) => [u.id, u]));
    const named = (ids: string[]) =>
      ids.map((userId) => ({ userId, name: people.get(userId)?.name ?? '', employeeCode: people.get(userId)?.employeeCode ?? '' })).sort((a, b) => a.name.localeCompare(b.name));
    return { esiCeilingRupees, esiMissing: named(esiMissing), epfMissing: named(epfMissing) };
  }
}
