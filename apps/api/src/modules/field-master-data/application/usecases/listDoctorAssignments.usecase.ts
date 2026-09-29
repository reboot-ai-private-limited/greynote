import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignment } from '../../domain/doctorAssignment.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';

/** Admin: who has been responsible for a Doctor, newest first. */
export class ListDoctorAssignmentsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
  ) {}

  async execute(doctorId: string): Promise<DoctorAssignment[]> {
    if (!(await this.doctors.findById(doctorId))) throw AppError.notFound('No such doctor.');
    return this.assignments.listForDoctor(doctorId);
  }
}
