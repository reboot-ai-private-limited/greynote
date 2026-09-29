import { parseBoolean, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import type { Doctor } from '../domain/doctor.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import type { AssignedScope } from '../domain/doctor.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import type { Actor } from './actor.js';

/**
 * Who sees a Doctor (LLD field-master-data.md, "Who can see a Doctor"): Admin sees all; an MR
 * sees the Doctors assigned to them — and, while `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` is on, only
 * those on a Route they still have; a manager sees the same for everyone in their downline.
 * Assignments on a Route an MR lost are hidden when read, never rewritten.
 */
export class DoctorVisibility {
  constructor(
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
  ) {}

  private followsRoute(): Promise<boolean> {
    return readConfig(this.config, 'DOCTOR_VISIBILITY_FOLLOWS_ROUTE', parseBoolean);
  }

  /** One scope per user: the Routes they currently have, or `null` when the switch is off. */
  async scopes(userIds: string[]): Promise<AssignedScope[]> {
    if (!(await this.followsRoute())) return userIds.map((userId) => ({ userId, routeIds: null }));
    return Promise.all(
      userIds.map(async (userId) => ({ userId, routeIds: (await this.territory.listRoutesForUser(userId)).map((r) => r.id) })),
    );
  }

  /** Is this Doctor one of `userId`'s own — active, assigned to them, and on a Route they still have (when that applies)? */
  async isVisibleToAssignee(userId: string, doctor: Doctor): Promise<boolean> {
    if (doctor.status !== 'active') return false;
    const assignment = await this.assignments.findActiveForDoctor(doctor.id);
    if (assignment?.userId !== userId) return false;
    const [scope] = await this.scopes([userId]);
    return scope!.routeIds === null || scope!.routeIds.includes(doctor.routeId);
  }

  /** Admin; the assigned MR; or a manager of the assigned MR. */
  async canView(actor: Actor, doctor: Doctor): Promise<boolean> {
    if (actor.role === 'ADMIN') return true;
    if (actor.role !== 'FIELD') return false;
    // An MR-added Doctor awaiting approval: the MR who added it and their managers can follow it.
    if (doctor.status === 'pending') return actor.id === doctor.addedBy || (await this.isManagerOf(actor.id, doctor.addedBy));
    const assignment = await this.assignments.findActiveForDoctor(doctor.id);
    if (!assignment) return false;
    if (assignment.userId !== actor.id && !(await this.isManagerOf(actor.id, assignment.userId))) return false;
    return this.isVisibleToAssignee(assignment.userId, doctor);
  }

  private async isManagerOf(managerId: string, userId: string): Promise<boolean> {
    return (await this.users.getDownline(managerId)).some((u) => u.id === userId);
  }
}
