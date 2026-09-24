import type { RouteAssignment } from './routeAssignment.entity.js';
import type { TerritoryStatus } from './territoryStatus.js';

export interface RouteAssignmentRepositoryPort {
  findActive(routeId: string, userId: string): Promise<RouteAssignment | null>;
  listForRoute(routeId: string, status?: TerritoryStatus): Promise<RouteAssignment[]>;
  listActiveForUser(userId: string): Promise<RouteAssignment[]>;
  countActiveForRoute(routeId: string): Promise<number>;
  create(input: { routeId: string; userId: string; assignedBy: string }): Promise<RouteAssignment>;
  deactivate(id: string, unassignedBy: string): Promise<RouteAssignment>;
}
