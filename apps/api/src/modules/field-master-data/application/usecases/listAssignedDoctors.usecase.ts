import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { AssignedDoctor, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
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

  /** `userId` narrows the view to one report; it must be in the caller's downline. */
  async team(actor: Actor, filter: AssignedFilter & { userId?: string | undefined }) {
    const downline = (await this.users.getDownline(actor.id)).map((u) => u.id);
    if (filter.userId && !downline.includes(filter.userId)) throw AppError.forbidden('That employee is not in your team.');
    return this.run(filter.userId ? [filter.userId] : downline, filter);
  }

  private async run(userIds: string[], filter: AssignedFilter) {
    const { page, pageSize, ...rest } = filter;
    const scopes = await this.visibility.scopes(userIds);
    const { items, total } = await this.doctors.listAssigned(scopes, rest, { page, pageSize });
    return buildPaginatedResult(await this.views.many(items), total, { page, pageSize });
  }
}
