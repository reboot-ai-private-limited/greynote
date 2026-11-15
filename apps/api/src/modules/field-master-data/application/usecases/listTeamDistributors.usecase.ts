import { AppError } from '@/shared/errors/AppError.js';
import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { PageQuery } from '../../domain/masterStatus.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';

export interface TeamDistributorFilter extends PageQuery {
  search?: string | undefined;
  userId?: string | undefined;
}

export type TeamDistributor = Distributor & { assignedTo: Array<{ userId: string; name: string; employeeCode: string }> };

/**
 * A manager's view of every distributor handed to anyone in their downline (and to themselves), computed on read — nothing is copied to
 * the manager. Visibility to an MR is still by `assignedUserIds` alone (decision-log 2026-11-04); a manager's is the union over the team.
 * `assignedTo` lists only the people in that team, so a manager never learns about assignees outside it.
 */
export class ListTeamDistributorsUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, filter: TeamDistributorFilter): Promise<PaginatedResult<TeamDistributor>> {
    const downline = (await this.users.getDownline(actor.id)).map((u) => u.id);
    if (filter.userId && !downline.includes(filter.userId)) throw AppError.forbidden('That employee is not in your team.');
    const people = filter.userId ? [filter.userId] : [actor.id, ...downline];
    const { page, pageSize, search } = filter;
    const found = await this.distributors.listActiveAssignedToAny(people, { search }, { page, pageSize });
    const inTeam = new Set(people);
    const names = new Map((await this.users.getUserSummaries([...new Set(found.items.flatMap((d) => d.assignedUserIds.filter((u) => inTeam.has(u))))])).map((u) => [u.id, u]));
    return {
      ...found,
      items: found.items.map((d) => ({
        ...d,
        assignedTo: d.assignedUserIds.filter((u) => names.has(u)).map((u) => ({ userId: u, name: names.get(u)!.name, employeeCode: names.get(u)!.employeeCode })),
      })),
    };
  }
}
