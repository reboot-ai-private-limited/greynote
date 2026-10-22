import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { clearAccessRevocation, revokeAccessTokens } from '@/shared/http/accessRevocations.js';
import { computeUserStatus } from '../../domain/onboarding.js';
import { NO_OFFBOARDING, type OffboardingImpact, type OffboardingPort, type OffboardingStep } from '../../domain/offboarding.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import type { ReassignManagerUseCase } from './reassignManager.usecase.js';

type Person = { id: string; name: string; employeeCode: string };

export interface DeactivationImpact {
  user: Person & { role: string; status: string; lastWorkingDay: string | null };
  /** Today in business time: the latest last working day allowed, and the default. */
  today: string;
  /** People who report to them directly (not inactive): they need a new manager first. */
  directReports: Person[];
  /** Their own manager: the suggested new manager for the team. */
  suggestedManager: Person | null;
  work: OffboardingImpact;
}

export interface DeactivationResult {
  /** True when the account was already inactive and only the hand-over was run again. */
  alreadyInactive: boolean;
  teamMoved: number;
  steps: OffboardingStep[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Taking an employee out of the organisation, and back (decision-log 2026-10-22). Admin only.
 *
 * Deactivating, in order: the checks (not oneself; a last working day no later than today and not before joining; a new manager when
 * they have direct reports) → the team moves to the new manager (all or nothing, the bulk-move rules; their waiting requests follow,
 * since an approver is read from the current manager) → the account becomes inactive with its last working day, every session ends and
 * every access token already issued stops working at once → what they held elsewhere is released (`OffboardingPort`: routes, coverage,
 * doctors, distributors, plans and leave after the last day, targets past the leaving month), each part on its own. Deactivating an
 * already inactive account only runs that last part again, so a part that failed can be retried.
 *
 * Reactivating (a rehire) makes the account usable again from a rejoining date: nothing released is given back; the manager, routes and
 * doctors are set again through the usual screens.
 */
export class DeactivateEmployeeUseCase {
  private offboarding: OffboardingPort = NO_OFFBOARDING;

  constructor(
    private readonly users: UserRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly roles: RoleRepositoryPort,
    private readonly sessions: UserSessionRepositoryPort,
    private readonly reassign: ReassignManagerUseCase,
    private readonly today: () => Promise<string>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  bindOffboarding(port: OffboardingPort): void {
    this.offboarding = port;
  }

  private async person(id: string): Promise<Person | null> {
    const u = await this.users.findById(id);
    return u ? { id: u.id, name: u.name, employeeCode: u.employeeCode } : null;
  }

  private async directReports(userId: string): Promise<Person[]> {
    const ids = await this.profiles.findUserIdsByFilter({ managerId: userId });
    return (await this.users.findByIds(ids)).filter((u) => u.status !== 'inactive').map((u) => ({ id: u.id, name: u.name, employeeCode: u.employeeCode }));
  }

  async impact(userId: string, lastWorkingDay?: string): Promise<DeactivationImpact> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound('No such employee.');
    const [role, profile, today] = await Promise.all([this.roles.findById(user.roleId), this.profiles.findByUserId(userId), this.today()]);
    const [directReports, suggestedManager, work] = await Promise.all([
      this.directReports(userId),
      profile?.managerId ? this.person(profile.managerId) : Promise.resolve(null),
      this.offboarding.impact(userId, lastWorkingDay ?? profile?.lastWorkingDay ?? today),
    ]);
    return {
      user: { id: user.id, name: user.name, employeeCode: user.employeeCode, role: role?.name ?? '', status: user.status, lastWorkingDay: profile?.lastWorkingDay ?? null },
      today,
      directReports,
      suggestedManager,
      work,
    };
  }

  async deactivate(actorId: string, userId: string, input: { lastWorkingDay: string; newManagerId?: string | null; doctorHandoverTo?: string | null }): Promise<DeactivationResult> {
    if (userId === actorId) throw AppError.badRequest('You cannot deactivate your own account. Ask another Admin.');
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound('No such employee.');
    const role = await this.roles.findById(user.roleId);
    const profile = await this.profiles.findByUserId(userId);
    const handover = input.doctorHandoverTo ?? null;

    if (user.status === 'inactive') {
      // Already out: only the hand-over runs again (a part that failed the first time), on the day recorded then.
      const lastWorkingDay = profile?.lastWorkingDay ?? (user.deactivatedAt ? ymd(user.deactivatedAt) : await this.today());
      return { alreadyInactive: true, teamMoved: 0, steps: await this.offboarding.release(userId, { lastWorkingDay, doctorHandoverTo: handover }, actorId) };
    }

    const today = await this.today();
    if (!DATE.test(input.lastWorkingDay)) throw AppError.badRequest('Give the last working day as a date.', { field: 'lastWorkingDay' });
    if (input.lastWorkingDay > today) throw AppError.badRequest('The last working day cannot be in the future. Deactivate the employee once they have left.', { field: 'lastWorkingDay' });
    if (profile?.dateOfJoining && input.lastWorkingDay < ymd(profile.dateOfJoining)) {
      throw AppError.badRequest('The last working day cannot be before the employee joined.', { field: 'lastWorkingDay' });
    }
    if (handover !== null) {
      const taker = await this.users.findById(handover);
      if (!taker || taker.id === userId || taker.status !== 'active') throw AppError.badRequest('Hand the doctors over to an active employee.', { field: 'doctorHandoverTo' });
    }

    const reports = await this.directReports(userId);
    let teamMoved = 0;
    if (reports.length > 0) {
      const managerId = input.newManagerId ?? null;
      if (!managerId) throw AppError.badRequest(`${user.name} manages ${reports.length} ${reports.length === 1 ? 'person' : 'people'}. Choose who they report to now.`, { field: 'newManagerId' });
      if (managerId === userId) throw AppError.badRequest('Choose someone other than the person leaving.', { field: 'newManagerId' });
      const manager = await this.users.findById(managerId);
      if (!manager || manager.status !== 'active') throw AppError.badRequest('The new manager must be an active employee.', { field: 'newManagerId' });
      // The bulk move checks everyone first and moves nobody if one fails, so nothing has changed if this throws.
      teamMoved = (await this.reassign.execute(actorId, { userIds: reports.map((r) => r.id), managerId })).moved.length;
    }

    const at = this.now();
    await this.users.update(userId, { status: 'inactive', deactivatedAt: at });
    if (role?.name === 'FIELD') await this.profiles.upsert(userId, { lastWorkingDay: input.lastWorkingDay, rejoinedOn: null });
    await this.sessions.revokeAllForUser(userId, 'ADMIN');
    revokeAccessTokens(userId, at);

    const steps = await this.offboarding.release(userId, { lastWorkingDay: input.lastWorkingDay, doctorHandoverTo: handover }, actorId);
    return { alreadyInactive: false, teamMoved, steps };
  }

  /** A rehire: usable again from `rejoinedOn` (after the last working day, no later than today). */
  async reactivate(userId: string, input: { rejoinedOn: string }): Promise<{ status: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound('No such employee.');
    if (user.status !== 'inactive') throw AppError.conflict('This employee is not deactivated.');
    if (user.deletedAt) throw AppError.conflict('This account was deleted at the employee’s request and cannot be reactivated.');
    const [role, profile, today] = await Promise.all([this.roles.findById(user.roleId), this.profiles.findByUserId(userId), this.today()]);
    if (!DATE.test(input.rejoinedOn)) throw AppError.badRequest('Give the rejoining date as a date.', { field: 'rejoinedOn' });
    if (input.rejoinedOn > today) throw AppError.badRequest('The rejoining date cannot be in the future.', { field: 'rejoinedOn' });
    if (profile?.lastWorkingDay && input.rejoinedOn <= profile.lastWorkingDay) {
      throw AppError.badRequest(`The rejoining date must be after the last working day (${profile.lastWorkingDay}).`, { field: 'rejoinedOn' });
    }
    // The status a new account with these details would have: active if the profile is complete, else pending until it is.
    const status = computeUserStatus({ status: 'pending', name: user.name }, profile, (role?.name ?? 'FIELD') as RoleName);
    await this.users.update(userId, { status, deactivatedAt: null });
    if (role?.name === 'FIELD') await this.profiles.upsert(userId, { rejoinedOn: input.rejoinedOn });
    clearAccessRevocation(userId);
    return { status };
  }
}
