import { AppError } from '@/shared/errors/AppError.js';
import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { ChemistAssignment } from '../../domain/chemistAssignment.entity.js';
import type { ChemistAssignmentRepositoryPort } from '../../domain/chemistAssignment.repository.port.js';
import type { PageQuery } from '../../domain/masterStatus.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';
import type { OutletHolders } from '../outletHolders.js';

/**
 * Admin makes an MR responsible for a Chemist. Many MRs can hold one Chemist, so this never replaces anyone — it adds. The MR must be
 * an active FIELD employee. Assigning someone who already has it is a no-op.
 */
export class AssignChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly assignments: ChemistAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
    /** Leave out only where managers may hold chemists anyway (tests of other rules). */
    private readonly holders?: OutletHolders,
  ) {}

  async execute(chemistId: string, userId: string, adminId: string): Promise<ChemistAssignment> {
    const chemist = await this.chemists.findById(chemistId);
    if (!chemist) throw AppError.notFound('No such chemist.');
    if (chemist.status !== 'active') throw AppError.conflict('This chemist is not active.');
    const user = await this.users.findUserSummary(userId);
    if (!user) throw AppError.badRequest('No such employee.', { field: 'userId' });
    if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees can be assigned chemists.', { field: 'userId' });
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field: 'userId' });
    const managerProblem = await this.holders?.managerProblem(userId, 'chemists');
    if (managerProblem) throw AppError.conflict(managerProblem, { field: 'userId' });
    return this.assignments.assign({ chemistId, userId, assignedBy: adminId });
  }
}

/** Admin takes one MR off a Chemist; the others keep it and the row stays as history. */
export class UnassignChemistUseCase {
  constructor(private readonly assignments: ChemistAssignmentRepositoryPort) {}

  async execute(chemistId: string, userId: string, adminId: string): Promise<void> {
    if (!(await this.assignments.unassign(chemistId, userId, adminId))) throw AppError.notFound('That employee is not assigned to this chemist.');
  }
}

export interface ChemistAssignmentView extends ChemistAssignment {
  user: { name: string; employeeCode: string } | null;
}

/** Who holds a Chemist, now and before, newest first. */
export class ListChemistAssignmentsUseCase {
  constructor(
    private readonly assignments: ChemistAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(chemistId: string): Promise<ChemistAssignmentView[]> {
    const rows = await this.assignments.listForChemist(chemistId);
    const byId = new Map((await this.users.getUserSummaries([...new Set(rows.map((r) => r.userId))])).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, user: byId.has(r.userId) ? { name: byId.get(r.userId)!.name, employeeCode: byId.get(r.userId)!.employeeCode } : null }));
  }
}

export interface TeamChemistFilter extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  userId?: string | undefined;
}

export type TeamChemist = Chemist & { assignedTo: Array<{ userId: string; name: string; employeeCode: string }> };

/**
 * A manager's view of every Chemist held by anyone in their downline (the manager's own too), computed on read — nothing is copied to the
 * manager. `userId` narrows to one report. A Chemist several MRs hold appears once, listing each of them.
 */
export class ListTeamChemistsUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly assignments: ChemistAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, filter: TeamChemistFilter): Promise<PaginatedResult<TeamChemist>> {
    const downline = (await this.users.getDownline(actor.id)).map((u) => u.id);
    if (filter.userId && !downline.includes(filter.userId)) throw AppError.forbidden('That employee is not in your team.');
    // `userId` = that person and everyone below them (an MR: just them), always inside the caller's own team.
    const people = filter.userId ? [filter.userId, ...(await this.users.getDownline(filter.userId)).map((u) => u.id)] : [actor.id, ...downline];
    const { page, pageSize, ...rest } = filter;
    const term = rest.search?.trim();
    const rows = await this.assignments.listActiveForUsers(people);
    const ids = [...new Set(rows.map((r) => r.chemistId))];
    // The search finds a Chemist by its own name, or by the name or code of an MR who holds it.
    const holderHits = term ? new Set(await this.users.findUserIdsByName(term, { restrictTo: people })) : new Set<string>();
    const alsoIds = rows.filter((r) => holderHits.has(r.userId)).map((r) => r.chemistId);
    const result = await this.chemists.listActiveAmong(ids, { ...(rest.routeId && { routeId: rest.routeId }), ...(term && { search: term, alsoIds }) }, { page, pageSize });
    const forThese = await this.assignments.listActiveForChemists(result.items.map((c) => c.id));
    const summaries = new Map((await this.users.getUserSummaries([...new Set(forThese.map((a) => a.userId))])).map((u) => [u.id, u]));
    const holders = (chemistId: string) =>
      forThese.filter((a) => a.chemistId === chemistId && summaries.has(a.userId)).map((a) => ({ userId: a.userId, name: summaries.get(a.userId)!.name, employeeCode: summaries.get(a.userId)!.employeeCode }));
    return { ...result, items: result.items.map((c) => ({ ...c, assignedTo: holders(c.id) })) };
  }
}

/**
 * A manager reads one Chemist's record to decide a new-chemist request (name, address, phone and the location the phone captured). Allowed when
 * the Chemist was added by someone below them, or is held by someone below them (an active assignment). Anyone else gets the same 404 as an id
 * that does not exist. (The plain `GET /chemists/:id` stays Admin and Accounts only.)
 */
export class ReviewChemistUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly assignments: ChemistAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly places?: { getPlace(placeId: string): Promise<{ name: string } | null> },
  ) {}

  /** The chemist, with its place's name (2026-11-28) for the approval preview. */
  async execute(actor: Actor, id: string): Promise<Chemist & { placeName?: string | null }> {
    const chemist = await this.chemists.findById(id);
    if (!chemist) throw AppError.notFound('No such chemist.');
    const below = new Set((await this.users.getDownline(actor.id)).map((u) => u.id));
    const addedBelow = chemist.addedBy !== null && below.has(chemist.addedBy);
    const heldBelow = addedBelow || (await this.assignments.listActiveForChemist(id)).some((a) => below.has(a.userId));
    if (!addedBelow && !heldBelow) throw AppError.notFound('No such chemist.');
    if (!this.places) return chemist;
    return { ...chemist, placeName: chemist.placeId ? ((await this.places.getPlace(chemist.placeId))?.name ?? null) : null };
  }
}
