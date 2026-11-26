import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { AssignedDoctor, AssignedScope, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { PageQuery } from '../../domain/masterStatus.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';
import type { DoctorVisibility } from '../doctorVisibility.js';
import type { DoctorViews, DoctorView } from '../doctorViews.js';

export interface AssignedFilter extends PageQuery {
  search?: string | undefined;
  routeId?: string | undefined;
  category?: string | undefined;
}

/** An MR's own Doctors, and a manager's view of their downline's — same visibility rule for both. */
export class ListAssignedDoctorsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly visibility: DoctorVisibility,
    private readonly users: UserDirectoryPort,
    private readonly views: DoctorViews,
  ) {}

  mine(actor: Actor, filter: AssignedFilter): Promise<PaginatedResult<DoctorView & Pick<AssignedDoctor, 'assignedUserId'>>> {
    return this.run([actor.id], filter);
  }

  /** `userId` narrows the view to one report and the people below them; it must be in the caller's downline. */
  async team(actor: Actor, filter: AssignedFilter & { userId?: string | undefined }) {
    const downline = (await this.users.getDownline(actor.id)).map((u) => u.id);
    if (filter.userId && !downline.includes(filter.userId)) throw AppError.forbidden('That employee is not in your team.');
    // `userId` = that person and everyone below them (an MR: just them).
    const people = filter.userId ? [filter.userId, ...(await this.users.getDownline(filter.userId)).map((u) => u.id)] : downline;
    const page = await this.run(people, filter, this.visibility.teamScopes(people));
    const notHeld = await this.visibility.routeNotHeld(page.items.flatMap((d) => (d.assignedTo ? [{ id: d.id, placeId: d.placeId, assignedUserId: d.assignedTo.userId }] : [])));
    return { ...page, items: page.items.map((d) => ({ ...d, routeNotHeld: notHeld.has(d.id) })) };
  }

  /** Admin: any employee's Doctors, seen the way that employee sees them. */
  async forUser(userId: string, filter: AssignedFilter) {
    if (!(await this.users.findUserSummary(userId))) throw AppError.notFound('Employee not found.');
    return this.run([userId], filter);
  }

  private async run(userIds: string[], filter: AssignedFilter, scopes?: AssignedScope[]) {
    const { page, pageSize, ...rest } = filter;
    scopes ??= await this.visibility.scopes(userIds);
    // The search box also finds a Doctor by the name or code of the employee they are assigned to, among the employees being read.
    const term = rest.search?.trim();
    const alsoUserIds = term ? await this.users.findUserIdsByName(term, { restrictTo: userIds }) : undefined;
    const { items, total } = await this.doctors.listAssigned(scopes, { ...rest, ...(alsoUserIds && { alsoUserIds }) }, { page, pageSize });
    return buildPaginatedResult(await this.views.many(items), total, { page, pageSize });
  }
}
