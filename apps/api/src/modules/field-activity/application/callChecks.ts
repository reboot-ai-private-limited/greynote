import { AppError } from '@/shared/errors/AppError.js';
import { parseBoolean, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import type { Doctor, Chemist } from '@/modules/field-master-data/field-master-data.public.js';
import { LOG_CODES, LogRefusal } from '../domain/logRefusal.js';
import type { PlanningPort } from '../domain/planning.port.js';
import type { FieldMasterDataPort } from '../domain/fieldMasterData.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

/**
 * What a call or follow-up may refer to, checked **at sync** against the data as it is now (`hld/01` §1.4):
 * the phone worked from a cache that Admin may have changed since — a Doctor reassigned to another MR, a Route
 * taken away — and the server's answer is authoritative. Each failure is a `LogRefusal` with the code the app
 * acts on.
 */
export class CallChecks {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
    private readonly planning: PlanningPort,
    private readonly config: ConfigReader,
  ) {}

  /** An active Doctor the MR is still assigned to — and can still see, when visibility follows the Route. */
  async doctor(userId: string, doctorId: string): Promise<Doctor> {
    const doctor = await this.master.getDoctor(doctorId);
    if (!doctor || doctor.status !== 'active') throw new LogRefusal(LOG_CODES.doctorNotFound, 'This doctor isn’t on the list any more.');
    if (!(await this.master.isAssignedToDoctor(userId, doctorId))) {
      throw new LogRefusal(LOG_CODES.doctorNotAssigned, 'You are no longer assigned to this doctor, so the call can’t be recorded.');
    }
    return doctor;
  }

  /** An active Chemist on a Route the MR still has. */
  async chemist(userId: string, chemistId: string): Promise<Chemist> {
    const chemist = await this.master.getChemist(chemistId);
    if (!chemist || chemist.status !== 'active') throw new LogRefusal(LOG_CODES.chemistNotFound, 'This chemist isn’t on the list any more.');
    if (!(await this.territory.listRoutesForUser(userId)).some((r) => r.id === chemist.routeId)) {
      throw new LogRefusal(LOG_CODES.chemistRouteNotAssigned, 'You no longer have this chemist’s route, so the call can’t be recorded.');
    }
    return chemist;
  }

  /**
   * A call stays inside the day's approved Plan: the Doctor's or Chemist's Route must be one the Plan lists. The report can't
   * depart from the plan — the way to change the day is for the manager or Admin to amend the plan, then log. (A Plan with no
   * Routes, a meeting day, has no calls.) The gate has already confirmed the Plan is approved.
   */
  async onPlannedRoute(userId: string, reportDate: string, routeId: string): Promise<void> {
    const day = await this.planning.getDailyPlanDay(userId, reportDate);
    if (!day?.routeIds.includes(routeId)) {
      throw new LogRefusal(LOG_CODES.routeNotInPlan, 'This call isn’t on a route in today’s approved plan. Ask your manager to amend the plan first.');
    }
  }

  /**
   * A Doctor call against the day's Plan. A Doctor on the Plan's list (picked or carried over) is in plan, whatever their Route. When the
   * Plan lists no Doctors at all (a day from before doctor lists, or none chosen) the Route rule above applies. Otherwise the Doctor is
   * not in plan: allowed and flagged while `ALLOW_UNPLANNED_DOCTOR_CALLS` is on, refused when it is off.
   */
  async doctorInPlan(userId: string, reportDate: string, doctor: Doctor): Promise<{ notInPlan: boolean }> {
    const day = await this.planning.getDailyPlanDay(userId, reportDate);
    const listed = day?.doctorIds ?? [];
    if (listed.includes(doctor.id)) return { notInPlan: false };
    if (listed.length === 0) {
      await this.onPlannedRoute(userId, reportDate, doctor.routeId);
      return { notInPlan: false };
    }
    if (await this.allowUnplanned()) return { notInPlan: true };
    throw new LogRefusal(LOG_CODES.routeNotInPlan, 'This doctor isn’t on today’s approved plan. Ask your manager to amend the plan first.');
  }

  /** Whether a Doctor outside the day's list may be called; a database not re-seeded yet reads as allowed. */
  private async allowUnplanned(): Promise<boolean> {
    try {
      return await readConfig(this.config, 'ALLOW_UNPLANNED_DOCTOR_CALLS', parseBoolean);
    } catch (err) {
      if (err instanceof AppError && (err.details as { reason?: string } | undefined)?.reason === 'CONFIG_KEY_MISSING') return true;
      throw err;
    }
  }

  /** Colleagues who worked with the MR: active employees, each once, never themselves. */
  async workWith(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if (new Set(ids).size !== ids.length) throw new LogRefusal(LOG_CODES.invalidWorkWith, 'A colleague is listed twice.');
    if (ids.includes(userId)) throw new LogRefusal(LOG_CODES.invalidWorkWith, 'You can’t work with yourself.');
    const active = new Set((await this.users.getUserSummaries(ids)).filter((u) => u.status === 'active').map((u) => u.id));
    if (ids.some((id) => !active.has(id))) throw new LogRefusal(LOG_CODES.invalidWorkWith, 'A colleague listed isn’t an active employee.');
  }
}
