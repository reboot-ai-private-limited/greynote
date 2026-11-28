import { AppError } from '@/shared/errors/AppError.js';
import { parseBoolean, readConfig } from '@/shared/config/readConfig.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../domain/configProvider.port.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { CalledDoctorsPort, DoctorDirectoryPort } from '../domain/doctorDirectory.port.js';
import type { PlannedDoctor } from '../domain/plan.js';
import { planStatus } from './planViews.js';

/** Most doctors one day's plan may list. */
export const MAX_PLAN_DOCTORS = 50;

const parseDays = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 365) throw new RangeError(`Not a whole number from 0 to 365: ${value}`);
  return n;
};

const FAR_PAST = '2000-01-01';

const addDays = (date: string, days: number): string => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Doctors planned on an earlier day and not called since — they carry over to later days' plans. Derived on read from the
 * approved plans and the reported calls, so nothing is stored that could drift. How far back it reaches is Config: without
 * limit, until the end of the month the doctor was planned in (the default), or a number of days after the planned day.
 */
export class CarryOver {
  private doctors: DoctorDirectoryPort | null = null;
  private called: CalledDoctorsPort | null = null;

  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly config: ConfigProviderPort,
    /** Managers have no carry-over (2026-11-27): they call what their team planned that day. Without it, everyone is treated as an MR. */
    private readonly isManager?: (userId: string) => Promise<boolean>,
  ) {}

  /** Field Master Data and Field Activity sit beside and above Planning, so they are handed in after the containers are built. */
  bind(doctors: DoctorDirectoryPort, called: CalledDoctorsPort): void {
    this.doctors = doctors;
    this.called = called;
  }

  directory(): DoctorDirectoryPort {
    if (!this.doctors) throw new Error('Planning: the doctor directory was never bound.');
    return this.doctors;
  }

  /** The doctors still owed on `date`: first planned on a day before it, not called since, still the MR's. Oldest first. */
  async pending(userId: string, date: string, people: string[] = [userId]): Promise<PlannedDoctor[]> {
    if (this.isManager && (await this.isManager(userId))) return [];
    const [forever, days] = await Promise.all([
      readConfig(this.config, PLANNING_CONFIG_KEYS.carryOverForever, parseBoolean),
      readConfig(this.config, PLANNING_CONFIG_KEYS.carryOverDays, parseDays),
    ]);
    const prev = addDays(date, -1);
    const from = forever ? FAR_PAST : days === 0 ? `${date.slice(0, 7)}-01` : addDays(date, -days);
    if (from > prev) return [];

    const firstPlanned = await this.uncalled(userId, from, prev);
    if (firstPlanned.size === 0) return [];
    const mine = new Set((await this.assignedTo(people)).map((d) => d.id));
    return [...firstPlanned]
      .filter(([doctorId]) => mine.has(doctorId))
      .map(([doctorId, carriedFrom]) => ({ doctorId, carriedFrom }))
      .sort((a, b) => (a.carriedFrom ?? '').localeCompare(b.carriedFrom ?? ''));
  }

  /**
   * Over a month's approved plans up to `to`: per doctor, the days they were planned and, if they were never called on or after
   * the day first planned, that day — the report's "missed since".
   */
  async monthSummary(userId: string, from: string, to: string): Promise<Array<{ doctorId: string; plannedDays: number; missedSince: string | null }>> {
    const plannedDays = new Map<string, number>();
    // The approved plans are read once and shared (2026-11-27; they were read twice).
    const approved = await this.approvedPlans(userId, from, to);
    for (const plan of approved) {
      for (const d of plan.doctors) plannedDays.set(d.doctorId, (plannedDays.get(d.doctorId) ?? 0) + 1);
    }
    const missed = await this.uncalled(userId, from, to, approved);
    return [...plannedDays].map(([doctorId, days]) => ({ doctorId, plannedDays: days, missedSince: missed.get(doctorId) ?? null }));
  }

  private async approvedPlans(userId: string, from: string, to: string): Promise<DailyPlan[]> {
    const plans = await this.plans.listForUser(userId, from, to);
    if (plans.length === 0) return [];
    // One query for every plan's approval (2026-11-27), not one each.
    const requests = new Map((await this.approvals.listForRecords('DAILY_PLAN', plans.map((p) => p.id))).map((r) => [r.recordId, r]));
    return plans.filter((plan) => {
      const status = planStatus(requests.get(plan.id) ?? null);
      return status === 'MANAGER_APPROVED' || status === 'APPROVED';
    });
  }

  /**
   * Doctors on approved plans in `from`–`to` still owed, each mapped to the day they have been owed since. Only a call AFTER the latest
   * planned day settles a doctor (2026-11-28): planned 2 Nov, called 27 Nov, planned again 28 Nov and not called → owed since 28 Nov. (It
   * used to take the first planned day of the window, so any call after it — the 27 Nov one — cleared the doctor for good.) A call on a
   * planned day settles that day. A carried entry keeps the day it was first planned unless a call came after that day.
   */
  private async uncalled(userId: string, from: string, to: string, approved?: DailyPlan[]): Promise<Map<string, string>> {
    if (!this.called) throw new Error('Planning: the called-doctors lookup was never bound.');
    const planned = new Map<string, Array<{ day: string; since: string }>>();
    for (const plan of approved ?? (await this.approvedPlans(userId, from, to))) {
      for (const d of plan.doctors) {
        const since = d.carriedFrom ?? plan.planDate;
        if (since < from) continue;
        planned.set(d.doctorId, [...(planned.get(d.doctorId) ?? []), { day: plan.planDate, since }]);
      }
    }
    const owed = new Map<string, string>();
    if (planned.size === 0) return owed;
    const earliest = [...planned.values()].flat().map((e) => e.since).sort()[0]!;
    const lastCall = await this.called(userId, { from: earliest, to });
    for (const [doctorId, days] of planned) {
      const last = lastCall.get(doctorId);
      const open = days.filter((e) => last === undefined || e.day > last).map((e) => (last !== undefined && e.since <= last ? e.day : e.since));
      if (open.length > 0) owed.set(doctorId, open.sort()[0]!);
    }
    return owed;
  }

  /** The active doctors assigned to any of `people`, each once, with their route and place. */
  private async assignedTo(people: string[]): Promise<Array<{ id: string; routeId: string; placeId?: string | undefined }>> {
    const lists = await Promise.all([...new Set(people)].map((p) => this.directory().listAssignedDoctors(p)));
    const seen = new Map<string, { id: string; routeId: string; placeId?: string | undefined }>();
    for (const d of lists.flat()) if (!seen.has(d.id)) seen.set(d.id, d);
    return [...seen.values()];
  }

  /**
   * The list a plan should carry: the doctors the MR picked (`pickedIds`) plus every doctor still owed, which can't be dropped.
   * Picked doctors must be assigned to the owner — or, for a manager, to anyone in their downline (`scope.people`) — and, unless
   * `scope.anyRoute` (managers), be where the day goes: at its To place (2026-11-26), or for a day from before places, on one of its
   * routes. `scope.max` is the most doctors the day may list.
   */
  async compose(
    plan: Pick<DailyPlan, 'userId' | 'planDate' | 'routeIds'> & { toPlaceId?: string | null | undefined },
    pickedIds: string[],
    scope: { people: string[]; max: number; anyRoute?: boolean } = { people: [plan.userId], max: MAX_PLAN_DOCTORS },
  ): Promise<PlannedDoctor[]> {
    const unique = [...new Set(pickedIds)];
    const owed = await this.pending(plan.userId, plan.planDate, scope.people);
    const owedIds = new Set(owed.map((d) => d.doctorId));
    const mine = new Map<string, { routeId: string; placeId?: string | undefined }>();
    for (const d of await this.assignedTo(scope.people)) mine.set(d.id, d);
    const routes = new Set(plan.routeIds);
    const where = (id: string) => (plan.toPlaceId ? mine.get(id)!.placeId === plan.toPlaceId : routes.has(mine.get(id)!.routeId));
    const picked = unique.filter((id) => !owedIds.has(id));
    const notYours = picked.filter((id) => !mine.has(id));
    if (notYours.length > 0) {
      throw AppError.badRequest('A doctor in this plan isn’t one of your doctors.', { field: 'doctorIds', doctorIds: notYours });
    }
    const offRoute = scope.anyRoute ? [] : picked.filter((id) => !where(id));
    if (offRoute.length > 0) {
      throw AppError.badRequest(plan.toPlaceId ? 'A doctor in this plan is not at the place the day goes to.' : 'A doctor in this plan is not on the routes planned for the day.', {
        field: 'doctorIds',
        doctorIds: offRoute,
      });
    }
    const all = [...owed, ...picked.map((doctorId) => ({ doctorId, carriedFrom: null }))];
    if (all.length > scope.max) {
      throw AppError.badRequest(`A day can list at most ${scope.max} doctors.`, { field: 'doctorIds' });
    }
    return all;
  }
}
