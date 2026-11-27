import { parseBoolean, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

const MR_LEVEL = 1;

/**
 * Who may hold a Doctor or Chemist (2026-11-27). With `MANAGERS_CAN_HOLD_OUTLETS` off (the default) only MRs do: a manager — any
 * designation above MR — sees and calls their team's instead. Used by assign, bulk assign, add-with-assignee and auto-assign on approval.
 */
export class OutletHolders {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
  ) {}

  /** Why this person can't hold doctors and chemists, or null when they can. */
  async managerProblem(userId: string, noun: 'doctors' | 'chemists'): Promise<string | null> {
    if (await readConfigOr(this.config, 'MANAGERS_CAN_HOLD_OUTLETS', parseBoolean, false)) return null;
    const [level] = await this.users.getDesignationLevels([userId]);
    return (level?.level ?? MR_LEVEL) > MR_LEVEL ? `Managers don’t hold ${noun} (System settings). Assign it to an MR of their team.` : null;
  }
}
