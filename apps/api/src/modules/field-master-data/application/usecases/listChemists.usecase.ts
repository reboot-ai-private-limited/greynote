import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { ChemistAssignmentRepositoryPort } from '../../domain/chemistAssignment.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assigneeScope, employeesMatching } from '../assigneeScope.js';

/** A Chemist with the employees who hold it now: who a manager sees it through. */
export type ChemistRow = Chemist & { assignedTo: Array<{ userId: string; name: string; employeeCode: string }> };

/**
 * Admin's chemist list. `assignedUserId` narrows it to the active chemists that employee holds now, and anyone below them holds (decision-log 2026-11-19), unless
 * `directOnly`. The name box also finds a chemist by the name or code of an employee who holds it (and their team). Every row says who holds it.
 */
export class ListChemistsUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly assignments: ChemistAssignmentRepositoryPort,
    private readonly users?: UserDirectoryPort,
  ) {}

  async execute(filter: ChemistFilter & { assignedUserId?: string | undefined; directOnly?: boolean | undefined }): Promise<PaginatedResult<ChemistRow>> {
    const { assignedUserId, directOnly, ...rest } = filter;
    const term = rest.search?.trim();
    let result: PaginatedResult<Chemist>;
    if (assignedUserId) {
      const people = this.users ? await assigneeScope(this.users, assignedUserId, directOnly) : [assignedUserId];
      const held = (await this.assignments.listActiveForUsers(people)).map((a) => a.chemistId);
      const { page, pageSize, search, routeId } = rest;
      const alsoIds = term && this.users ? await this.heldBy(await employeesMatching(this.users, term, directOnly)) : undefined;
      result = await this.chemists.listActiveAmong(held, { search, routeId, ...(alsoIds && { alsoIds }) }, { page, pageSize });
    } else if (term && this.users) {
      const alsoIds = await this.heldBy(await employeesMatching(this.users, term, directOnly));
      result = alsoIds.length > 0 ? await this.chemists.list({ ...rest, alsoIds }) : await this.chemists.list(rest);
    } else {
      result = await this.chemists.list(rest);
    }
    return { ...result, items: await this.withHolders(result.items) };
  }

  private async heldBy(userIds: string[]): Promise<string[]> {
    return userIds.length === 0 ? [] : [...new Set((await this.assignments.listActiveForUsers(userIds)).map((a) => a.chemistId))];
  }

  private async withHolders(items: Chemist[]): Promise<ChemistRow[]> {
    if (items.length === 0 || !this.users) return items.map((c) => ({ ...c, assignedTo: [] }));
    const rows = await this.assignments.listActiveForChemists(items.map((c) => c.id));
    const people = new Map((await this.users.getUserSummaries([...new Set(rows.map((r) => r.userId))])).map((u) => [u.id, u]));
    return items.map((c) => ({
      ...c,
      assignedTo: rows.filter((r) => r.chemistId === c.id).flatMap((r) => { const u = people.get(r.userId); return u ? [{ userId: u.id, name: u.name, employeeCode: u.employeeCode }] : []; }),
    }));
  }
}
