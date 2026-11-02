import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { DoctorFilter, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

/** Admin: every Doctor, filterable by Route, category, status and name. The name box also finds a Doctor by the name or code of the employee they are assigned to. */
export class ListDoctorsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly views: DoctorViews,
    private readonly users: UserDirectoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
  ) {}

  async execute(filter: DoctorFilter): Promise<PaginatedResult<DoctorView>> {
    const term = filter.search?.trim();
    let alsoDoctorIds: string[] | undefined;
    if (term) {
      const employeeIds = await this.users.findUserIdsByName(term);
      const rows = await Promise.all(employeeIds.map((id) => this.assignments.listActiveForUser(id)));
      alsoDoctorIds = rows.flat().map((a) => a.doctorId);
    }
    const { items, total } = await this.doctors.list({ ...filter, ...(alsoDoctorIds && { alsoDoctorIds }) });
    return buildPaginatedResult(await this.views.many(items), total, filter);
  }
}
