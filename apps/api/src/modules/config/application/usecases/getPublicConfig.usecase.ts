import { CONFIG_DEFINITIONS, validateConfigValue } from '../../domain/configDefinitions.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { parseClosedYears } from '@/shared/time/financialYearClose.js';
import { MONTH_NAMES } from '@/shared/time/businessTime.js';

/** The settings every client needs: how to read dates the way the server does, and whether a manager may add doctors and chemists (so the app can hide the button). Nothing else is exposed to non-Admins. */
export interface PublicConfigView {
  /** 1 to 12: `4` for an April start. */
  financialYearStartMonth: number;
  /** An IANA name, e.g. `Asia/Kolkata`. */
  businessTimezone: string;
  /** `HH:mm`: when the business day rolls over, e.g. `02:00`. */
  dayStartTime: string;
  /** Start years of the financial years an Admin has closed: no daily work can be written into them. */
  closedFinancialYears: number[];
  /** `MANAGER_CAN_ADD_DOCTORS`: whether a manager (anyone with a team) may add a doctor. */
  managerCanAddDoctors: boolean;
  /** `MANAGER_CAN_ADD_CHEMISTS`: the same for chemists. */
  managerCanAddChemists: boolean;
}

const defaultOf = (key: string) => CONFIG_DEFINITIONS.find((d) => d.key === key)!.default;

/**
 * For any signed-in user: the financial-year start month and the business timezone, so the portal and the app read "this year" and
 * "today" as the server does instead of assuming April and Indian time. A stored value that breaks its own rules (an older one, from
 * before they were checked) would fail the server's own reads; here it falls back to the default so a client still gets an answer, and
 * the Admin's settings screen shows the fault.
 */
export class GetPublicConfigUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  private async valid(key: string): Promise<string> {
    const def = CONFIG_DEFINITIONS.find((d) => d.key === key)!;
    const stored = (await this.repository.findByKey(key))?.value;
    if (stored === undefined) return def.default;
    const check = validateConfigValue(def, stored);
    return check.ok && check.value === stored ? stored : defaultOf(key);
  }

  async execute(): Promise<PublicConfigView> {
    const [month, timezone, dayStart, closed, doctors, chemists] = await Promise.all([
      this.valid('FY_START_MONTH'),
      this.valid('BUSINESS_TIMEZONE'),
      this.valid('DAY_START_TIME'),
      this.valid('FY_CLOSED_YEARS'),
      this.valid('MANAGER_CAN_ADD_DOCTORS'),
      this.valid('MANAGER_CAN_ADD_CHEMISTS'),
    ]);
    return {
      financialYearStartMonth: MONTH_NAMES.indexOf(month as (typeof MONTH_NAMES)[number]) + 1,
      businessTimezone: timezone,
      dayStartTime: dayStart,
      closedFinancialYears: parseClosedYears(closed),
      managerCanAddDoctors: doctors === 'true',
      managerCanAddChemists: chemists === 'true',
    };
  }
}
