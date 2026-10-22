import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { DoctorRetirement } from '../doctorRetirement.js';

/** Admin ends an MR's responsibility for a Doctor; the row stays as history. The MR's editable plans lose the doctor. */
export class UnassignDoctorUseCase {
  constructor(
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly retirement: DoctorRetirement,
  ) {}

  async execute(doctorId: string, userId: string, adminId: string): Promise<void> {
    if (!(await this.assignments.endActiveIfUser(doctorId, userId, adminId))) {
      throw AppError.notFound('That employee is not assigned to this doctor.');
    }
    await this.retirement.release(doctorId, userId);
  }
}
