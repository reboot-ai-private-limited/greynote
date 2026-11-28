import { isFieldDay, type WorkingType } from '@greynote/contracts';
import type { RecordRouteType } from '../domain/call.entity.js';
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
/** The day's Plan as a record is stamped against it. */
export interface DayContext {
  workingType: WorkingType;
  routeIds: string[];
  doctorIds: string[];
  /** Where the day is spent (2026-11-26); null on older days and meetings. */
  toPlaceId: string | null;
}

export class CallChecks {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
    private readonly planning: PlanningPort,
  ) {}

  /**
   * An active Doctor the caller is still assigned to — and can still see, when visibility follows the Route — or, for a manager, one
   * assigned to anyone below them in the team. A manager's call is also held to their day's plan (`managerCallOnPlan`).
   */
  async doctor(userId: string, doctorId: string): Promise<Doctor> {
    const doctor = await this.master.getDoctor(doctorId);
    if (!doctor || doctor.status !== 'active') throw new LogRefusal(LOG_CODES.doctorNotFound, 'This doctor isn’t on the list any more.');
    if (await this.master.isAssignedToDoctor(userId, doctorId)) return doctor;
    const assigned = await this.master.getAssignedUserId(doctorId);
    if (assigned !== null && (await this.isAbove(userId, assigned))) return doctor;
    throw new LogRefusal(LOG_CODES.doctorNotAssigned, 'You are no longer assigned to this doctor, so the call can’t be recorded.');
  }

  /**
   * A manager's doctor call (2026-11-27, kept 2026-11-28): only a doctor on that day's plan, which for a manager is the doctors their
   * work-with people planned. Any other doctor of the team is a follow-up. An MR is not checked here (their calls follow assignment and
   * the phone's list).
   */
  async managerCallOnPlan(userId: string, day: DayContext, doctorId: string): Promise<void> {
    const [level] = await this.users.getDesignationLevels([userId]);
    if ((level?.level ?? 1) <= 1 || day.doctorIds.includes(doctorId)) return;
    throw new LogRefusal(LOG_CODES.doctorNotOnTeamPlan, 'This doctor is not on today’s plan of the people you work with. Log a follow-up instead.');
  }

  /**
   * Whether `managerId` is above `memberId` in the reporting chain. Walks up from the one assigned MR (about five hops) rather than loading
   * the manager's whole downline, so a ZSM or NSM logging a call costs the same as an ASM.
   */
  private async isAbove(managerId: string, memberId: string): Promise<boolean> {
    return (await this.users.getManagerChain(memberId)).some((u) => u.id === managerId);
  }

  /**
   * An active Doctor in the requester's own scope, for a Doctor Service (2026-11-02): one the person is assigned to, or one assigned to
   * anyone below them in the team. So an MR asks for their own doctors, a manager for their team's, whatever the designation.
   */
  async serviceDoctor(userId: string, doctorId: string): Promise<Doctor> {
    const doctor = await this.master.getDoctor(doctorId);
    if (!doctor || doctor.status !== 'active') throw new LogRefusal(LOG_CODES.doctorNotFound, 'This doctor isn’t on the list any more.');
    if (await this.master.isAssignedToDoctor(userId, doctorId)) return doctor;
    const assigned = await this.master.getAssignedUserId(doctorId);
    if (assigned !== null && (await this.isAbove(userId, assigned))) return doctor;
    throw new LogRefusal(LOG_CODES.doctorNotAssigned, 'This doctor is not yours or your team’s, so a service can’t be requested for them.');
  }

  /**
   * An active Chemist the caller is assigned to now (assignment, not the Route, decides — decision-log 2026-11-16) or, for a manager, one
   * held by anyone below them in the team (2026-11-23, the same rule as a doctor).
   */
  async chemist(userId: string, chemistId: string): Promise<Chemist> {
    const chemist = await this.master.getChemist(chemistId);
    if (!chemist || chemist.status !== 'active') throw new LogRefusal(LOG_CODES.chemistNotFound, 'This chemist isn’t on the list any more.');
    if (await this.master.isAssignedToChemist(userId, chemistId)) return chemist;
    const holders = await this.master.getChemistHolderIds(chemistId);
    for (const holder of holders) if (await this.isAbove(userId, holder)) return chemist;
    // The refusal code keeps its old name so phones already in the field still recognise it; it now means "no longer assigned".
    throw new LogRefusal(LOG_CODES.chemistRouteNotAssigned, 'You are no longer assigned to this chemist, so the call can’t be recorded.');
  }

  /**
   * A chemist is called at the day's To place (2026-11-27); a chemist elsewhere gets a follow-up instead. An older day without places is not
   * checked.
   */
  chemistAtPlace(day: DayContext, chemist: Pick<Chemist, 'placeId'>): void {
    if (day.toPlaceId && chemist.placeId !== day.toPlaceId) {
      throw new LogRefusal(LOG_CODES.chemistNotAtPlace, 'This chemist is not at today’s place. Log a follow-up for them instead.');
    }
  }

  /**
   * The day's approved Plan, for stamping a record. Only a field work or doctor campaign day has doctors and chemists to see: on a
   * meeting, conference or strike day there is nothing to record. A day with no Plan row reads as plain field work (the gate has
   * already confirmed an approved Plan, so this is only a gap in test data or old rows).
   */
  async day(userId: string, reportDate: string): Promise<DayContext> {
    const day = await this.planning.getDailyPlanDay(userId, reportDate);
    const workingType = day?.workingType ?? 'FIELD_WORK';
    if (!isFieldDay(workingType)) {
      throw new LogRefusal(LOG_CODES.callNotAllowedForWorkType, 'Today’s plan is not a field day, so there are no calls or follow-ups to record. Submit the report with your remarks.');
    }
    return { workingType, routeIds: day?.routeIds ?? [], doctorIds: day?.doctorIds ?? [], toPlaceId: day?.toPlaceId ?? null };
  }

  /**
   * The Route a Doctor or Chemist belongs to and its type (HQ / Ex-station / Out-station). `routeNotInPlan` is always false now (2026-11-17): the
   * phone offers only the day's planned and carried-over doctors, a doctor's route is its own, and nothing is shown as "not in plan".
   * The stored field stays for history.
   */
  async route(_day: DayContext, routeId: string): Promise<{ routeId: string; routeType: RecordRouteType | null; routeNotInPlan: boolean }> {
    return { routeId, routeType: (await this.territory.getRoute(routeId))?.routeType ?? null, routeNotInPlan: false };
  }

  /** Always false since 2026-11-17 (see `route`): kept so the stored `notInPlan` field is still written, as false, on new calls. */
  doctorNotInPlan(_day: DayContext, _doctorId: string, _routeNotInPlan: boolean): boolean {
    return false;
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
