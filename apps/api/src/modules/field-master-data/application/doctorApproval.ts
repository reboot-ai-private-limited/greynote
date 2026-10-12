import { parseBoolean, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

export const NEW_DOCTOR_KIND = 'NEW_DOCTOR';

/**
 * The `NEW_DOCTOR` kind's `onStatusChange`, run inside the approval module's transaction (LLD
 * field-master-data.md, Doctor-creation approval; if it throws, the decision rolls back too):
 *
 * - `APPROVED` — the Doctor becomes `active` and `approvedAt` starts Phase 6's coverage wait. If
 *   `AUTO_ASSIGN_DOCTOR_ON_APPROVAL` is on, the MR who added it becomes responsible for it — unless
 *   they can't be (inactive, or no longer on the Doctor's Route), in which case it's left unassigned
 *   for Admin rather than failing the approval.
 * - `REOPENED` (Admin reopens an approved one) — back to `pending`, so nobody acts on it while it's
 *   reconsidered; an existing assignment is kept, hidden until it's approved again.
 * - Rejected or withdrawn — nothing to do; it stays `pending`.
 */
export function makeDoctorApprovalHandler(
  doctors: DoctorRepositoryPort,
  assignments: DoctorAssignmentRepositoryPort,
  users: UserDirectoryPort,
  territory: TerritoryPort,
  config: ConfigReader,
) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    if (change.status !== 'APPROVED' && change.status !== 'REOPENED') return;
    const doctor = await doctors.findById(change.recordId);
    if (!doctor) throw AppError.internal('INTERNAL', { reason: 'DOCTOR_NOT_FOUND', recordId: change.recordId });

    if (change.status === 'REOPENED') {
      await doctors.update(doctor.id, { status: 'pending', approvedAt: null }, ctx);
      return;
    }

    await doctors.update(doctor.id, { status: 'active', approvedAt: new Date() }, ctx);
    if (!(await readConfig(config, 'AUTO_ASSIGN_DOCTOR_ON_APPROVAL', parseBoolean))) return;
    if (await assignments.findActiveForDoctor(doctor.id)) return;
    const mr = await users.findUserSummary(doctor.addedBy);
    if (mr?.role !== 'FIELD' || mr.status === 'inactive') return;
    if (!(await territory.listRoutesForUser(mr.id)).some((r) => r.id === doctor.routeId)) return;
    const approver = change.request.history.at(-1)?.actorId ?? doctor.addedBy;
    await assignments.create({ doctorId: doctor.id, userId: mr.id, assignedBy: approver }, ctx);
  };
}
