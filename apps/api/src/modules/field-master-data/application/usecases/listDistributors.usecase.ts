import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { MasterStatus, PageQuery } from '../../domain/masterStatus.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assigneeScope, employeesMatching } from '../assigneeScope.js';
import { scopeOfPlace } from '../distributorCoverage.js';

export interface ListDistributorsInput extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  hqId?: string | undefined;
  zoneId?: string | undefined;
  assignedUserId?: string | undefined;
  directOnly?: boolean | undefined;
  status?: MasterStatus | undefined;
}

/** A Distributor with the employees assigned to it: who a manager sees it through. */
export type DistributorRow = Distributor & { assignedTo: Array<{ userId: string; name: string; employeeCode: string }> };

/**
 * Admin: Distributors serving a Route, an HQ or a Zone (the most specific of those given). A Distributor that serves a whole Zone
 * serves every HQ and Route in it, so the place is widened to everything above and below it before matching. `assignedUserId` counts a manager's team too
 * (decision-log 2026-11-19) unless `directOnly`; the name box also finds a Distributor by the name or code of an employee assigned to it (and their team).
 */
export class ListDistributorsUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly users?: UserDirectoryPort,
  ) {}

  async execute(input: ListDistributorsInput): Promise<PaginatedResult<DistributorRow>> {
    const { routeId, hqId, zoneId, directOnly, assignedUserId, ...rest } = input;
    const scope = routeId || hqId || zoneId ? await scopeOfPlace(this.territory, { routeId, hqId, zoneId }) : undefined;
    if (scope && scope.zoneIds.length + scope.hqIds.length + scope.routeIds.length === 0) return buildPaginatedResult([], 0, input);
    const term = rest.search?.trim();
    const result = await this.distributors.list({
      ...rest,
      scope,
      ...(assignedUserId && (this.users ? { assignedAny: await assigneeScope(this.users, assignedUserId, directOnly) } : { assignedUserId })),
      ...(term && this.users ? { searchAssignedAny: await employeesMatching(this.users, term, directOnly) } : {}),
    });
    return { ...result, items: await this.withHolders(result.items) };
  }

  private async withHolders(items: Distributor[]): Promise<DistributorRow[]> {
    if (!this.users) return items.map((d) => ({ ...d, assignedTo: [] }));
    const people = new Map((await this.users.getUserSummaries([...new Set(items.flatMap((d) => d.assignedUserIds))])).map((u) => [u.id, u]));
    return items.map((d) => ({ ...d, assignedTo: d.assignedUserIds.flatMap((id) => { const u = people.get(id); return u ? [{ userId: u.id, name: u.name, employeeCode: u.employeeCode }] : []; }) }));
  }
}
