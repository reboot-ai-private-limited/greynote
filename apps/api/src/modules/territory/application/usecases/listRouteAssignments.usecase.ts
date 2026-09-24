import { AppError } from '@/shared/errors/AppError.js';
import type { RouteAssignment } from '../../domain/routeAssignment.entity.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { TerritoryStatus } from '../../domain/territoryStatus.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

export type RouteAssignmentView = RouteAssignment & {
  user: { id: string; employeeCode: string; name: string } | null;
};

/** A Route's assignments with each employee's code and name, so Admin sees who, not just ids. */
export class ListRouteAssignmentsUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(routeId: string, status?: TerritoryStatus): Promise<RouteAssignmentView[]> {
    if (!(await this.routes.findById(routeId))) throw AppError.notFound();
    const rows = await this.assignments.listForRoute(routeId, status);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await Promise.all(userIds.map((id) => this.users.findUserSummary(id)));
    const userById = new Map(users.filter((u) => u !== null).map((u) => [u.id, u]));

    return rows.map((row) => {
      const user = userById.get(row.userId);
      return { ...row, user: user ? { id: user.id, employeeCode: user.employeeCode, name: user.name } : null };
    });
  }
}
