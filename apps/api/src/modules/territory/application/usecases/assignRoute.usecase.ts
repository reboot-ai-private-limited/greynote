import { AppError } from '@/shared/errors/AppError.js';
import type { RouteAssignment } from '../../domain/routeAssignment.entity.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

/**
 * Adds an MR to a Route's coverage. Only FIELD users (any designation — an ASM who works a route
 * is assigned the same way), and not an `inactive` one. A `pending` user can be assigned, since
 * giving them routes is part of setting them up.
 */
export class AssignRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(routeId: string, userId: string, adminId: string): Promise<RouteAssignment> {
    const route = await this.routes.findById(routeId);
    if (!route) throw AppError.notFound();
    if (route.status !== 'active') throw AppError.conflict('This route is inactive. Reactivate it first.');

    const user = await this.users.findUserSummary(userId);
    if (!user) throw AppError.badRequest('No such employee.', { field: 'userId' });
    if (user.role !== 'FIELD') {
      throw AppError.badRequest('Only field employees can be assigned to routes.', { field: 'userId' });
    }
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field: 'userId' });

    if (await this.assignments.findActive(routeId, userId)) {
      throw AppError.conflict('That employee is already assigned to this route.', { field: 'userId' });
    }
    return this.assignments.create({ routeId, userId, assignedBy: adminId });
  }
}
