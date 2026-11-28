import { AppError } from '@/shared/errors/AppError.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { Actor } from '../actor.js';
import type { DoctorVisibility } from '../doctorVisibility.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

export type DoctorTargetsInput = Partial<Pick<Doctor, 'dateOfBirth' | 'anniversary' | 'visitFrequency'>>;

/**
 * A manager sets the date of birth and anniversary of a Doctor assigned to someone in their downline — and nothing else about it.
 * The visit frequency is Admin's alone (2026-11-28): a manager who sends one is refused. The MR themself can't change their own
 * doctor here. Admin also has the full `PATCH /doctors/:id`. A Doctor the caller can't see is a 404.
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
      if (change.visitFrequency !== undefined && change.visitFrequency !== doctor.visitFrequency) {
        throw AppError.forbidden('Only Admin can change a doctor’s visit frequency.');
      }
      const view = await this.views.one(doctor);
      if (view.assignedTo?.userId === actor.id) throw AppError.forbidden('Only a manager or Admin can change a doctor’s visit target.');
    }
    const updated = await this.doctors.update(id, change);
    if (!updated) throw AppError.notFound('No such doctor.');
    return this.views.one(updated);
  }
}
