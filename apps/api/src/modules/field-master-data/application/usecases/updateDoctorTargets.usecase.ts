import { AppError } from '@/shared/errors/AppError.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { Actor } from '../actor.js';
import type { DoctorVisibility } from '../doctorVisibility.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

export type DoctorTargetsInput = Partial<Pick<Doctor, 'dateOfBirth' | 'anniversary' | 'visitFrequency'>>;

/**
 * A manager sets the visit frequency, date of birth and anniversary of a Doctor assigned to someone in
 * their downline — and nothing else about it. The MR themself can't change their own target. Admin can too
 * (Admin also has the full `PATCH /doctors/:id`). A Doctor the caller can't see is a 404.
 */
export class UpdateDoctorTargetsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly visibility: DoctorVisibility,
    private readonly views: DoctorViews,
  ) {}

  async execute(actor: Actor, id: string, change: DoctorTargetsInput): Promise<DoctorView> {
    const doctor = await this.doctors.findById(id);
    if (!doctor || !(await this.visibility.canView(actor, doctor))) throw AppError.notFound('No such doctor.');
    if (actor.role !== 'ADMIN') {
      const view = await this.views.one(doctor);
      if (view.assignedTo?.userId === actor.id) throw AppError.forbidden('Only a manager or Admin can change a doctor’s visit target.');
    }
    const updated = await this.doctors.update(id, change);
    if (!updated) throw AppError.notFound('No such doctor.');
    return this.views.one(updated);
  }
}
