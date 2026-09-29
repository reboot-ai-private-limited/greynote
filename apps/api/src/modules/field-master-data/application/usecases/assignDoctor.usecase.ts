import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignment } from '../../domain/doctorAssignment.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

/**
 * Admin makes an MR responsible for a Doctor, replacing whoever was. The MR must be an active FIELD
 * employee who has the Doctor's Route (sign-off C3) — visibility follows the Route, so an
 * assignment without it would be invisible. Assigning the current MR again is a no-op.
 */
export class AssignDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly territory: TerritoryPort,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(doctorId: string, userId: string, adminId: string): Promise<DoctorAssignment> {
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw AppError.notFound('No such doctor.');
    if (doctor.status !== 'active') throw AppError.conflict('This doctor is not active.');

    const user = await this.users.findUserSummary(userId);
    if (!user) throw AppError.badRequest('No such employee.', { field: 'userId' });
    if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees can be assigned doctors.', { field: 'userId' });
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field: 'userId' });

    const routes = await this.territory.listRoutesForUser(userId);
    if (!routes.some((r) => r.id === doctor.routeId)) {
      throw AppError.conflict('That employee does not have this doctor’s route. Assign the route to them first.', { field: 'userId' });
    }

    const current = await this.assignments.findActiveForDoctor(doctorId);
    if (current?.userId === userId) return current;

    const created = await this.transactions.run(async (ctx) => {
      await this.assignments.endActive(doctorId, adminId, ctx);
      return this.assignments.create({ doctorId, userId, assignedBy: adminId }, ctx);
    });
    if (!created) throw AppError.conflict('This doctor’s assignment was changed at the same time. Reload and try again.');
    return created;
  }
}
