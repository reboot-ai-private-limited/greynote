import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';
import type { DoctorView } from '../doctorViews.js';
import type { UpdateDoctorInput, UpdateDoctorUseCase } from './updateDoctor.usecase.js';

/**
 * Before approving a Doctor an MR added, the MR's manager (or Admin) can correct any of its details, including the
 * location. Only while it is `pending` — after approval the Admin's full edit applies. Not their own submission,
 * and not for a manager outside the MR's upline (a 404, as for any Doctor they can't see).
 */
export class ReviewPendingDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly update: UpdateDoctorUseCase,
  ) {}

  async execute(actor: Actor, id: string, change: Omit<UpdateDoctorInput, 'status'>): Promise<DoctorView> {
    const doctor = await this.doctors.findById(id);
    if (!doctor || doctor.status !== 'pending') throw AppError.notFound('No such doctor waiting for approval.');
    if (actor.role !== 'ADMIN') {
      const isManager = actor.role === 'FIELD' && actor.id !== doctor.addedBy && (await this.users.getDownline(actor.id)).some((u) => u.id === doctor.addedBy);
      if (!isManager) throw AppError.notFound('No such doctor waiting for approval.');
    }
    return this.update.execute(id, change);
  }
}
