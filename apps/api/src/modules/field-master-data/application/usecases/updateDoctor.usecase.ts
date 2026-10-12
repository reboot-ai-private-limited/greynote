import { AppError } from '@/shared/errors/AppError.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';
import type { SpecialtyCatalog } from '../specialtyCatalog.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export type UpdateDoctorInput = Partial<
  Pick<Doctor, 'routeId' | 'name' | 'address' | 'email' | 'specialty' | 'qualification' | 'clinicName' | 'phone' | 'location' | 'status' | 'dateOfBirth' | 'anniversary' | 'visitFrequency'>
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
    private readonly specialties: SpecialtyCatalog,
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
    // A changed speciality must be on the list. One left as it was (an older doctor whose free text is not on the list) is not re-checked.
    if (change.specialty !== undefined) {
      const same = change.specialty.trim().toLowerCase() === current.specialty.trim().toLowerCase();
      change = { ...change, specialty: same ? current.specialty : await this.specialties.resolve(change.specialty) };
    }
    const updated = await this.doctors.update(id, change);
    if (!updated) throw AppError.notFound('No such doctor.');
    return this.views.one(updated);
  }
}
