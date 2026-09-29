import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';

/** Admin ends an MR's responsibility for a Doctor; the row stays as history. */
export class UnassignDoctorUseCase {
  constructor(private readonly assignments: DoctorAssignmentRepositoryPort) {}

  async execute(doctorId: string, userId: string, adminId: string): Promise<void> {
    if (!(await this.assignments.endActiveIfUser(doctorId, userId, adminId))) {
      throw AppError.notFound('That employee is not assigned to this doctor.');
    }
  }
}
