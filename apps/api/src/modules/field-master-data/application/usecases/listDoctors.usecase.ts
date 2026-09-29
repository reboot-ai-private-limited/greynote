import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { DoctorFilter, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

/** Admin: every Doctor, filterable by Route, category, status and name. */
export class ListDoctorsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly views: DoctorViews,
  ) {}

  async execute(filter: DoctorFilter): Promise<PaginatedResult<DoctorView>> {
    const { items, total } = await this.doctors.list(filter);
    return buildPaginatedResult(await this.views.many(items), total, filter);
  }
}
