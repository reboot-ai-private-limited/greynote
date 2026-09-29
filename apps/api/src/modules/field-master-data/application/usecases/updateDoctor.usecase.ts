import { AppError } from '@/shared/errors/AppError.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export type UpdateDoctorInput = Partial<
  Pick<Doctor, 'routeId' | 'category' | 'name' | 'address' | 'email' | 'specialty' | 'qualification' | 'location' | 'status'>
>;

/**
 * Admin edits a Doctor, including correcting its location. Moving it needs an active Route.
 * Deactivating is refused while an MR is assigned — Admin unassigns first.
 */
export class UpdateDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly views: DoctorViews,
  ) {}

  async execute(id: string, change: UpdateDoctorInput): Promise<DoctorView> {
    const current = await this.doctors.findById(id);
    if (!current) throw AppError.notFound('No such doctor.');
    if (current.status === 'pending' && change.status !== undefined) {
      throw AppError.conflict('This doctor is waiting for approval. Approve or reject it in the approvals inbox.', { field: 'status' });
    }
    if (change.routeId !== undefined && change.routeId !== current.routeId) {
      await requireActiveRoute(this.territory, change.routeId);
    }
    if (change.status === 'inactive' && current.status !== 'inactive' && (await this.assignments.findActiveForDoctor(id))) {
      throw AppError.conflict('This doctor is assigned to an MR. Remove the assignment first.', { field: 'status' });
    }
    const updated = await this.doctors.update(id, change);
    if (!updated) throw AppError.notFound('No such doctor.');
    return this.views.one(updated);
  }
}
