import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { Actor } from '../actor.js';
import type { DoctorVisibility } from '../doctorVisibility.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

/** Admin, the assigned MR, or a manager of that MR; anyone else gets a 404, so a Doctor's existence isn't revealed. */
export class GetDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly visibility: DoctorVisibility,
    private readonly views: DoctorViews,
  ) {}

  async execute(actor: Actor, id: string): Promise<DoctorView> {
    const doctor = await this.doctors.findById(id);
    if (!doctor || !(await this.visibility.canView(actor, doctor))) throw AppError.notFound('No such doctor.');
    return this.views.one(doctor);
  }
}
