import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DoctorRetirement } from '../doctorRetirement.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';
import type { SpecialtyCatalog } from '../specialtyCatalog.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export type UpdateDoctorInput = Partial<
  Pick<Doctor, 'routeId' | 'name' | 'address' | 'email' | 'specialty' | 'qualification' | 'clinicName' | 'phone' | 'location' | 'status' | 'dateOfBirth' | 'anniversary' | 'visitFrequency'>
>;

/**
 * Admin edits a Doctor, including correcting its location, also while it is inactive. Moving it needs an active Route.
 * Deactivating ends the MR's assignment in the same transaction (decision-log 2026-10-22; it used to be refused until Admin
 * unassigned), then takes the doctor off every Daily Plan still editable. `GET /doctors/:id/impact` shows Admin what that touches.
 */
export class UpdateDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly views: DoctorViews,
    private readonly specialties: SpecialtyCatalog,
    private readonly transactions: TransactionRunnerPort,
    private readonly retirement: DoctorRetirement,
  ) {}

  /** `actorId` is who ends the assignment when this deactivates the doctor. */
  async execute(id: string, change: UpdateDoctorInput, actorId?: string): Promise<DoctorView> {
    const current = await this.doctors.findById(id);
    if (!current) throw AppError.notFound('No such doctor.');
    if (current.status === 'pending' && change.status !== undefined) {
      throw AppError.conflict('This doctor is waiting for approval. Approve or reject it in the approvals inbox.', { field: 'status' });
    }
    if (change.routeId !== undefined && change.routeId !== current.routeId) {
      await requireActiveRoute(this.territory, change.routeId);
    }
    // A changed speciality must be on the list. One left as it was (an older doctor whose free text is not on the list) is not re-checked.
    if (change.specialty !== undefined) {
      const same = change.specialty.trim().toLowerCase() === current.specialty.trim().toLowerCase();
      change = { ...change, specialty: same ? current.specialty : await this.specialties.resolve(change.specialty) };
    }
    const deactivating = change.status === 'inactive' && current.status === 'active';
    if (!deactivating) {
      const updated = await this.doctors.update(id, change);
      if (!updated) throw AppError.notFound('No such doctor.');
      return this.views.one(updated);
    }
    if (!actorId) throw AppError.internal('INTERNAL', { reason: 'DEACTIVATE_WITHOUT_ACTOR' });
    const updated = await this.transactions.run(async (ctx) => {
      const saved = await this.doctors.update(id, change, ctx);
      await this.assignments.endActive(id, actorId, ctx);
      return saved;
    });
    if (!updated) throw AppError.notFound('No such doctor.');
    await this.retirement.release(id, null);
    return this.views.one(updated);
  }
}
