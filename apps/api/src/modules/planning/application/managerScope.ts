import { readConfigOr } from '@/shared/config/readConfig.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../domain/configProvider.port.js';
import { MR_LEVEL } from '../domain/plan.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import { MAX_PLAN_DOCTORS } from './carryOver.js';

const DEFAULT_MANAGER_MAX_DOCTORS = 100;

const parsePositive = (value: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Not a positive whole number: ${value}`);
  return n;
};

/**
 * Whose routes and doctors a Daily Plan may draw on. An MR plans from their own. A manager (any designation above MR) works
 * with people from their team: their plan may use the routes of the team members it names in `workWith`, and the doctors of anyone
 * in their downline.
 */
export class ManagerScope {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigProviderPort,
  ) {}

  async isManager(userId: string): Promise<boolean> {
    const levels = await this.users.getDesignationLevels([userId]);
    return (levels[0]?.level ?? MR_LEVEL) > MR_LEVEL;
  }

  /** The team members whose routes and doctors count for this owner's plan: none unless the owner is a manager. */
  async team(ownerId: string, workWith: string[]): Promise<string[]> {
    if (workWith.length === 0 || !(await this.isManager(ownerId))) return [];
    return workWith;
  }

  /**
   * How the doctor list is built for this plan: whose doctors, how many at most, and whether the route check applies. A manager may
   * pick the doctor of anyone in their whole downline (not only the people in Work With), on any route; an MR only their own.
   */
  async doctorScope(ownerId: string, _workWith: string[]): Promise<{ people: string[]; max: number; anyRoute: boolean }> {
    if (!(await this.isManager(ownerId))) return { people: [ownerId], max: MAX_PLAN_DOCTORS, anyRoute: false };
    const max = await readConfigOr(this.config, PLANNING_CONFIG_KEYS.managerMaxDoctors, parsePositive, DEFAULT_MANAGER_MAX_DOCTORS);
    const downline = (await this.users.getDownline(ownerId)).map((u) => u.id);
    return { people: [ownerId, ...downline], max, anyRoute: true };
  }
}
