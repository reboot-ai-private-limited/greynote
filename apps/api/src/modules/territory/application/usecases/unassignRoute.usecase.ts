import { AppError } from '@/shared/errors/AppError.js';
import type { RouteAssignment } from '../../domain/routeAssignment.entity.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';

/** Ends the active assignment; the row stays, `inactive`, as history. */
export class UnassignRouteUseCase {
  constructor(private readonly assignments: RouteAssignmentRepositoryPort) {}

  async execute(routeId: string, userId: string, adminId: string): Promise<RouteAssignment> {
    const active = await this.assignments.findActive(routeId, userId);
    if (!active) throw AppError.notFound('That employee is not assigned to this route.');
    return this.assignments.deactivate(active.id, adminId);
  }
}
