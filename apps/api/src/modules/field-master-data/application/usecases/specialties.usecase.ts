import { AppError } from '@/shared/errors/AppError.js';
import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { MasterStatus } from '../../domain/masterStatus.js';
import type { Specialty } from '../../domain/specialty.entity.js';
import type { SpecialtyFilter, SpecialtyRepositoryPort } from '../../domain/specialty.repository.port.js';

const taken = (): AppError => AppError.conflict('A speciality with this name already exists.', { field: 'name' });

export class ListSpecialtiesUseCase {
  constructor(private readonly specialties: SpecialtyRepositoryPort) {}
  execute(filter: SpecialtyFilter): Promise<PaginatedResult<Specialty>> {
    return this.specialties.list(filter);
  }
}

export class CreateSpecialtyUseCase {
  constructor(private readonly specialties: SpecialtyRepositoryPort) {}
  async execute(input: { name: string }): Promise<Specialty> {
    return (await this.specialties.create(input)) ?? Promise.reject(taken());
  }
}

export class GetSpecialtyUseCase {
  constructor(private readonly specialties: SpecialtyRepositoryPort) {}
  async execute(id: string): Promise<Specialty> {
    return (await this.specialties.findById(id)) ?? Promise.reject(AppError.notFound('No such speciality.'));
  }
}

/** A rename also renames it on the Doctors that carry it, so none is left pointing at a name that no longer exists. */
export class UpdateSpecialtyUseCase {
  constructor(
    private readonly specialties: SpecialtyRepositoryPort,
    private readonly doctors: DoctorRepositoryPort,
  ) {}

  async execute(id: string, change: { name?: string; status?: MasterStatus }): Promise<Specialty> {
    const current = await this.specialties.findById(id);
    if (!current) throw AppError.notFound('No such speciality.');
    const updated = await this.specialties.update(id, change);
    if (!updated) throw taken();
    if (updated.name !== current.name) await this.doctors.renameSpecialty(current.name, updated.name);
    return updated;
  }
}
