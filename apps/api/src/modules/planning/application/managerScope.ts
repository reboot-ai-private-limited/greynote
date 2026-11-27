import { readConfigOr } from '@/shared/config/readConfig.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../domain/configProvider.port.js';
import { MR_LEVEL } from '../domain/plan.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import type { RouteDirectoryPort } from '../domain/routeDirectory.port.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import { isFieldDay, type PlannedDoctor } from '../domain/plan.js';
import { MAX_PLAN_DOCTORS } from './carryOver.js';
import { planStatus } from './planViews.js';

const DEFAULT_MANAGER_MAX_DOCTORS = 100;

const parsePositive = (value: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Not a positive whole number: ${value}`);
  return n;
};

/**
 * Whose routes, people and doctors a plan may draw on. An MR plans from their own. A manager (any designation above MR) plans the
 * routes held by anyone below them (`routePeople`), then, on a Daily Plan, works with the people who hold the day's routes
 * (`workWithCandidates`) and plans the doctors on those routes who are assigned to anyone below them (decision-log 2026-11-17).
 */
export class ManagerScope {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigProviderPort,
    /** Who holds a route; without it `workWithCandidates` finds nobody. */
    private readonly routes?: RouteDirectoryPort,
    /** The team's plans for a day (a manager's work-with and doctors, 2026-11-27); without it a manager has nobody to work with. */
    private readonly day?: { plans: Pick<DailyPlanRepositoryPort, 'listForUsersOnDate'>; approvals: Pick<ApprovalsPort, 'getForRecord'> },
  ) {}

  async isManager(userId: string): Promise<boolean> {
    const levels = await this.users.getDesignationLevels([userId]);
    return (levels[0]?.level ?? MR_LEVEL) > MR_LEVEL;
  }

  /**
   * Whose routes this owner's plan may name besides their own (decision-log 2026-11-17): nobody for an MR; for a manager, **everyone below
   * them**, at any depth. Routes belong to MRs, so a manager plans the routes held by their team — nothing is copied onto the manager.
   * The routes themselves come in one batch (`RouteDirectoryPort.listRoutesForUsers`), however big the team.
   */
  async routePeople(ownerId: string): Promise<string[]> {
    if (!(await this.isManager(ownerId))) return [];
    return (await this.users.getDownline(ownerId)).map((u) => u.id);
  }

  /**
   * The people a manager may name under "Works with" for a day on these routes: everyone below them who **holds** one of the routes, and
   * the managers between such a holder and the owner (a ZSM works with the ASM above the MRs who hold the route). Nobody else, and not
   * the owner. One holders query plus at most a few hops up from each holder. `workWithOptions` also says which of the chosen routes each
   * person holds (themselves or through the people below them) — the brackets in the phone's dropdown.
   */
  async workWithOptions(ownerId: string, routeIds: string[]): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (!this.routes || routeIds.length === 0) return out;
    const below = new Set((await this.users.getDownline(ownerId)).map((u) => u.id));
    const add = (person: string, route: string) => out.set(person, (out.get(person) ?? new Set<string>()).add(route));
    const chains = new Map<string, Awaited<ReturnType<UserDirectoryPort['getManagerChain']>>>();
    for (const { routeId, userId } of await this.routes.listHoldersOfRoutes(routeIds)) {
      if (!below.has(userId)) continue;
      add(userId, routeId);
      if (!chains.has(userId)) chains.set(userId, await this.users.getManagerChain(userId));
      for (const m of chains.get(userId)!) {
        if (m.id === ownerId) break;
        add(m.id, routeId);
      }
    }
    return out;
  }

  /**
   * A manager's day (2026-11-27): the people below them whose daily plan for that date is **approved** and goes to the **same To place**
   * (a field day). These are the only people the manager may work with that day, and their planned doctors are the manager's.
   */
  async teamAtPlace(ownerId: string, planDate: string, toPlaceId: string | null): Promise<DailyPlan[]> {
    if (!this.day || !toPlaceId) return [];
    const below = (await this.users.getDownline(ownerId)).map((u) => u.id);
    const out: DailyPlan[] = [];
    for (const plan of await this.day.plans.listForUsersOnDate(below, planDate)) {
      if (plan.toPlaceId !== toPlaceId || !isFieldDay(plan.workingType)) continue;
      const status = planStatus(await this.day.approvals.getForRecord('DAILY_PLAN', plan.id));
      if (status === 'MANAGER_APPROVED' || status === 'APPROVED') out.push(plan);
    }
    return out;
  }

  /** The doctors a manager calls that day: every doctor on the approved plans of the people they work with, each once. No picking. */
  async teamDoctors(ownerId: string, planDate: string, toPlaceId: string | null, workWith: string[]): Promise<PlannedDoctor[]> {
    if (workWith.length === 0) return [];
    const chosen = new Set(workWith);
    const seen = new Set<string>();
    const out: PlannedDoctor[] = [];
    for (const plan of await this.teamAtPlace(ownerId, planDate, toPlaceId)) {
      if (!chosen.has(plan.userId)) continue;
      for (const d of plan.doctors) {
        if (seen.has(d.doctorId)) continue;
        seen.add(d.doctorId);
        out.push({ doctorId: d.doctorId, carriedFrom: null });
      }
    }
    return out;
  }

  async workWithCandidates(ownerId: string, routeIds: string[]): Promise<Set<string>> {
    return new Set((await this.workWithOptions(ownerId, routeIds)).keys());
  }

  /**
   * How the doctor list is built for this plan: whose doctors, how many at most, and whether the route check applies. A manager may
   * pick the doctor of anyone in their whole downline, but only on the day's routes (decision-log 2026-11-17, narrowing 2026-11-03 for
   * planning; calls keep their own check); an MR only their own.
   */
  async doctorScope(ownerId: string, _workWith: string[]): Promise<{ people: string[]; max: number; anyRoute: boolean }> {
    if (!(await this.isManager(ownerId))) return { people: [ownerId], max: MAX_PLAN_DOCTORS, anyRoute: false };
    const max = await readConfigOr(this.config, PLANNING_CONFIG_KEYS.managerMaxDoctors, parsePositive, DEFAULT_MANAGER_MAX_DOCTORS);
    const downline = (await this.users.getDownline(ownerId)).map((u) => u.id);
    return { people: [ownerId, ...downline], max, anyRoute: false };
  }
}
