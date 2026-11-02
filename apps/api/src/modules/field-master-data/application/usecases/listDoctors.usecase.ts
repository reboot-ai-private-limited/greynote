import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { DoctorFilter, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

/** Admin: every Doctor, filterable by Route, status, name, the employee assigned (or nobody) and category. The name box also finds a Doctor by the name or code of the employee they are assigned to. */
export class ListDoctorsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly views: DoctorViews,
    private readonly users: UserDirectoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
  ) {}

  async execute({ assignedUserId, ...filter }: DoctorFilter & { assignedUserId?: string | undefined }): Promise<PaginatedResult<DoctorView>> {
    if (assignedUserId && filter.unassigned) throw AppError.badRequest('Choose an employee or unassigned, not both.', { field: 'unassigned' });
    // "Assigned to this employee" is the employee's active assignments; an employee with none has nothing to show.
    let onlyDoctorIds: string[] | undefined;
    if (assignedUserId) {
      onlyDoctorIds = (await this.assignments.listActiveForUser(assignedUserId)).map((a) => a.doctorId);
      if (onlyDoctorIds.length === 0) return buildPaginatedResult([], 0, filter);
    }
    const term = filter.search?.trim();
    let alsoDoctorIds: string[] | undefined;
    if (term) {
      const employeeIds = await this.users.findUserIdsByName(term);
      const rows = await Promise.all(employeeIds.map((id) => this.assignments.listActiveForUser(id)));
      alsoDoctorIds = rows.flat().map((a) => a.doctorId);
    }
    const { items, total } = await this.doctors.list({ ...filter, ...(alsoDoctorIds && { alsoDoctorIds }), ...(onlyDoctorIds && { onlyDoctorIds }) });
    return buildPaginatedResult(await this.views.many(items), total, filter);
  }
}
